#!/usr/bin/env node
"use strict";

// Orchestrates `pnpm dev`. Resolves both dev ports once — the TiddlyWiki HTTP
// port (prefers 8080) and the content-HMR SSE port (prefers 35730) — falling
// back to a random free port whenever the preferred one is already taken (e.g. a
// parallel `pnpm dev` for another nikorion plugin): move aside rather than kill
// the occupant. The chosen ports are shared with the two long-lived children via
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

const PREFERRED_TW_PORT = Number(process.env.TW_PORT) || 8080;
const PREFERRED_SSE_PORT = Number(process.env.HMR_SSE_PORT) || 35730;
const PORT_TIDDLER = path.resolve("wiki/tiddlers/$__dev-hmr-port.tid");

// Can we bind this port right now? (briefly opens then closes a listener)
function isFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "0.0.0.0");
  });
}

// Ask the OS for any free ephemeral port (listen on 0 → it assigns one).
function randomFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function resolvePort(preferred, label) {
  if (await isFree(preferred)) return preferred;
  const port = await randomFreePort();
  process.stdout.write(`[dev] ${label} port ${preferred} busy → using free port ${port}\n`);
  return port;
}

(async () => {
  const twPort = await resolvePort(PREFERRED_TW_PORT, "TiddlyWiki");
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