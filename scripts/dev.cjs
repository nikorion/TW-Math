#!/usr/bin/env node
"use strict";

// Orchestrates `pnpm dev`. Resolves both dev ports once — the TiddlyWiki HTTP
// port and the content-HMR SSE port — as random free ports (or the ones asked for
// through TW_PORT / HMR_SSE_PORT, falling back to a random one if taken), so any
// number of nikorion dev servers can run in parallel. The chosen ports are shared with the two long-lived children via
// env vars (TW_PORT, HMR_SSE_PORT):
//   • nodemon      → reboots TW on module / plugin.info changes (nodemon.json
//                    supplies watch/ext; the port is injected here via --exec)
//   • dev-hmr.cjs  → content-HMR SSE server (reads both ports)
// The resolved SSE port is also written to a git-ignored dev tiddler
// ($:/config/dev/hmr-port) so the browser client ($:/dev/hmr) can open the SSE
// connection on the right port when it was moved aside.
//
// Zero added dependency: port resolution uses the native `net` module and the two
// children are spawned directly (no concurrently).

const net = require("net");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// No fixed default: both ports are random free ones (so every plugin's dev
// server can run at once, and none squats 8080, which another service uses).
// Set TW_PORT / HMR_SSE_PORT to ask for a specific port instead.
const PREFERRED_TW_PORT = Number(process.env.TW_PORT) || 0;
const PREFERRED_SSE_PORT = Number(process.env.HMR_SSE_PORT) || 0;
const PORT_TIDDLER = path.resolve("wiki/tiddlers/system/$__config_dev_hmr-port.tid");

// TiddlyWiki's `--listen` defaults to host 127.0.0.1, so probe that same
// interface. Binding 0.0.0.0 here gave false positives on Windows: it succeeds
// even when another process already holds 127.0.0.1:<port>, so a stale dev
// server was reported "free" and TW then crashed with EADDRINUSE instead of
// moving aside.
const HOST = "127.0.0.1";
// The HMR SSE server (dev-hmr.cjs) listens with no host, i.e. dual-stack `::` — probe it
// the same way (host undefined), otherwise a 127.0.0.1 probe reports a port held on
// `::` as free and a parallel `pnpm dev` loses its HMR.

// Can we bind this port right now? (briefly opens then closes a listener)
function isFree(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

// Ask the OS for any free ephemeral port (listen on 0 → it assigns one).
function randomFreePort(host) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, host, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function resolvePort(preferred, label, host) {
  if (preferred && (await isFree(preferred, host))) return preferred;
  const port = await randomFreePort(host);
  if (preferred) process.stdout.write(`[dev] ${label} port ${preferred} busy → using free port ${port}\n`);
  return port;
}

(async () => {
  const twPort = await resolvePort(PREFERRED_TW_PORT, "TiddlyWiki", HOST);
  const ssePort = await resolvePort(PREFERRED_SSE_PORT, "HMR SSE");

  // Publish the SSE port to the browser client through a git-ignored tiddler,
  // written before TW boots so it is part of the served store.
  fs.writeFileSync(PORT_TIDDLER, `title: $:/config/dev/hmr-port\n\n${ssePort}\n`);

  const env = { ...process.env, TW_PORT: String(twPort), HMR_SSE_PORT: String(ssePort) };
  process.stdout.write(`[dev] TiddlyWiki → http://localhost:${twPort}  (HMR SSE :${ssePort})\n`);

  const nodemonBin = require.resolve("nodemon/bin/nodemon.js");
  const nodemon = spawn(
    process.execPath,
    [nodemonBin, "--exec", `tiddlywiki wiki --listen port=${twPort}`],
    { stdio: "inherit", env }
  );
  const hmr = spawn(process.execPath, [path.join(__dirname, "dev-hmr.cjs")], {
    stdio: "inherit",
    env,
  });

  // Ctrl+C (or nodemon stopping) tears both down. dev-hmr exiting on its own is
  // NOT fatal: it bails out when the SSE port is already taken (a parallel
  // `pnpm dev` for another plugin), and TW should keep serving.
  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of [nodemon, hmr]) {
      if (!child.killed) child.kill();
    }
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  nodemon.on("exit", shutdown);
})();