/*\
title: $:/plugins/nikorion/math/modules/scope.js
type: application/javascript
module-type: library
\*/

/*
 * scope.js — variable scope builder 📦
 *
 * Parses a "data tiddler" (a plain-text tiddler whose content defines
 * named variables) and returns a scope object that can be passed directly
 * to math.evaluate(expr, scope).
 *
 * ── Data tiddler format ───────────────────────────────────────────────
 *
 * One variable per line.  Each line is:
 *
 *   name: expression
 *
 * The expression on the right-hand side is evaluated by mathjs, so it can
 * reference any mathjs function, constant, unit, or a variable defined on
 * a previous line.  Examples:
 *
 *   r: 3
 *   area: pi * r^2
 *   speed: 100 km/h
 *   f: a + sqrt(b)
 *
 * Note: unlike the earlier "a:2,b:5" multi-var line format, we use ONE
 * variable per line to avoid conflicts with expressions that naturally
 * contain commas (e.g. max(1, 2), vectors [1, 2, 3]).
 *
 * Lines that are blank or do not contain a colon are silently ignored,
 * so comments can be added with any prefix that does not contain ":".
 *
 * ─────────────────────────────────────────────────────────────────────
 *
 * Exported:
 *   parseDataTiddler(content, math) → scope object  (may throw on bad lines)
 *   buildScope(tiddlerTitle, wiki, math) → scope object | {}
 */

(function () {
  "use strict";

  /**
   * Parse raw tiddler text into a mathjs scope object. 🔍
   * Variables are evaluated in order, so later lines can reference earlier ones.
   *
   * @param  {string} content  Raw tiddler text (newline-separated "name: expr" lines)
   * @param  {object} math     The mathjs instance (passed in to avoid circular require)
   * @returns {object}         Scope object ready for math.evaluate()
   */
  exports.parseDataTiddler = function parseDataTiddler(content, math) {
    const scope = {};

    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue; // blank line

      const colonIdx = line.indexOf(":");
      if (colonIdx < 1) continue; // no colon → treat as comment / ignore

      const name  = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (!name || !value) continue;

      // Evaluate in the growing scope so forward references to earlier variables work.
      // Errors are rethrown with the variable name for better diagnostics.
      try {
        scope[name] = math.evaluate(value, scope);
      } catch (e) {
        throw new Error(`Variable "${name}": ${e.message}`);
      }
    }

    return scope;
  };

  /**
   * Convenience helper for use inside the widget. 🧩
   * Looks up a tiddler by title in the TiddlyWiki wiki, reads its text,
   * and delegates to parseDataTiddler.  Returns {} if the tiddler is not
   * found or has no text content — the widget then evaluates without scope.
   *
   * @param  {string} title   Tiddler title (from the "data" widget attribute)
   * @param  {object} wiki    TiddlyWiki wiki instance (this.wiki in a widget)
   * @param  {object} math    The mathjs instance
   * @returns {object}        Scope object (possibly empty)
   */
  exports.buildScope = function buildScope(title, wiki, math) {
    if (!title) return {};

    const tiddler = wiki.getTiddler(title);
    if (!tiddler) return {};

    const text = tiddler.fields.text || "";
    if (!text.trim()) return {};

    return exports.parseDataTiddler(text, math);
  };

})();
