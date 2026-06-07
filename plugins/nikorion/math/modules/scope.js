/*\
title: $:/plugins/nikorion/math/modules/scope.js
type: application/javascript
module-type: library
\*/

/*
 * scope.js — variable scope builder 📦
 *
 * Builds a scope object (plain JS object) that is passed to
 * math.evaluate(expr, scope) to inject named variables.
 *
 * ── Two modes, selected automatically ────────────────────────────────
 *
 * The widget attribute  data="<value>"  is resolved as follows:
 *
 *  1. TIDDLER MODE  🗒️
 *     If a tiddler whose title equals <value> exists in the wiki, its
 *     text content is parsed line by line.  Each line must be:
 *
 *       name: expression
 *
 *     The right-hand side is evaluated by mathjs (so it can reference
 *     any mathjs function, constant, or a variable defined on an earlier
 *     line).  One variable per line to avoid conflicts with expressions
 *     that naturally contain commas (e.g. max(1, 2), [1, 2, 3]).
 *
 *     Example tiddler text:
 *       r: 3
 *       h: 10
 *       area: pi * r^2
 *
 *  2. INLINE JSON MODE  📝
 *     If no tiddler with that title is found, <value> is treated as a
 *     JSON object body (without the surrounding braces).  The string is
 *     wrapped in { } and parsed with JSON.parse().
 *
 *     Keys must be quoted, values must be JSON literals (number, string,
 *     boolean, null, array, nested object).  mathjs expressions are NOT
 *     evaluated — the values reach the scope exactly as written.
 *
 *     Example attribute value:
 *       data='"a":2,"b":5'
 *       data='"label":"hello world","scale":1.5'
 *
 *     This mode is convenient for quick one-off values without creating
 *     a dedicated tiddler.
 *
 * ── Error handling ───────────────────────────────────────────────────
 * Both modes throw descriptive errors on bad input; the widget catches
 * them and displays them subject to the normal ERROR_DELAY debounce. ⚠️
 *
 * Exported:
 *   buildScope(dataAttr, wiki, math) → scope object (may be {})
 */

(function () {
  "use strict";

  // ── Tiddler mode ──────────────────────────────────────────────────────
  // Parse "name: expression" lines, evaluating each value with mathjs so
  // that later lines can reference earlier variables. 🔗
  function parseTiddlerScope(text, math) {
    const scope = {};

    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;                    // blank line — skip

      const colonIdx = line.indexOf(":");
      if (colonIdx < 1) continue;            // no colon → treat as comment

      const name  = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (!name || !value) continue;

      try {
        scope[name] = math.evaluate(value, scope);
      } catch (e) {
        throw new Error(`Variable "${name}": ${e.message}`);
      }
    }

    return scope;
  }

  // ── Inline JSON mode ──────────────────────────────────────────────────
  // Wrap the raw string in { } and delegate to JSON.parse(). 🔧
  // Values are stored as-is (no mathjs evaluation).
  function parseInlineScope(raw) {
    try {
      return JSON.parse(`{${raw}}`);
    } catch (e) {
      throw new Error(
        `Invalid inline scope — expected JSON key-value pairs like "a":2,"b":5 ` +
        `(${e.message})`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // buildScope (exported) 🚀
  // ─────────────────────────────────────────────────────────────────────
  exports.buildScope = function buildScope(dataAttr, wiki, math) {
    if (!dataAttr) return {};

    // Mode 1: tiddler exists → parse line by line with mathjs evaluation.
    const tiddler = wiki.getTiddler(dataAttr);
    if (tiddler) {
      const text = tiddler.fields.text ?? "";
      return text.trim() ? parseTiddlerScope(text, math) : {};
    }

    // Mode 2: no tiddler found → treat the attribute value as inline JSON.
    return parseInlineScope(dataAttr);
  };

})();