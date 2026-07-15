/*\
title: $:/plugins/nikorion/math/modules/scope.js
type: application/javascript
module-type: library
\*/

/*
 * scope.js — variable scope builder 📦
 *
 * Builds a scope object passed to math.evaluate(expr, scope) to inject
 * named variables into the expression.
 *
 * ── Two modes, selected automatically ────────────────────────────────
 *
 *  1. TIDDLER MODE 🗒️
 *     If the scope attribute value matches an existing tiddler title,
 *     its text is parsed line by line:
 *
 *       r: 3
 *       h: 10
 *       area: pi * r^2
 *
 *     Each value expression is passed through normalize()
 *     before being evaluated by mathjs.  Errors include the variable name.
 *
 *     One variable per line (avoids ambiguity with commas inside expressions
 *     like max(1, 2) or [1, 2, 3]).  Later lines may reference earlier ones.
 *
 *  2. INLINE MODE 📝
 *     If no tiddler is found, the value is parsed as an object literal
 *     evaluated by MATHJS ITSELF (math.evaluate) — never by JavaScript.
 *     mathjs's parser is sandboxed (no access to prototypes, constructors
 *     or globals), so the scope attribute can NOT execute arbitrary JS,
 *     even inside an imported tiddler. 🛡️
 *
 *       scope="{a:1, b:2}"
 *
 *     Syntax rules:
 *
 *     • Outer braces {} are required (auto-added if accidentally omitted).
 *
 *     • Keys must be valid mathjs identifiers: 🔑
 *         [a-zA-Z_$][a-zA-Z0-9_$]*
 *       Valid:    a  r2  my_var  _x  $val  alpha1
 *       Invalid:  2r (starts with digit)  my-var (contains hyphen)
 *       Keys do NOT need quotes — write {a:2} not {"a":2}.
 *
 *     • Values are mathjs literals — or any mathjs expression:
 *         numbers      42  3.14  -1  1e6
 *         booleans     true  false
 *         null
 *         strings      "hello world"
 *         arrays       [1, 2, 3]   (become mathjs matrices)
 *         expressions  pi/4  unit("5 cm")  bignumber("1.5")
 *       No nested objects — {a:{x:1}} is not supported.
 *
 *     • Number values are passed through normalize() before evaluation,
 *       so thousands spaces ("1 000 000") work.  Decimal commas are
 *       NOT supported — EN notation only, like everywhere else on input.
 *
 *     • Legacy math.* prefix still accepted:  math.unit(…) → unit(…),
 *       math.BigNumber(…) → bignumber(…).  unit() arguments are
 *       auto-quoted; no inner quotes needed. 🔧
 *       With calcPrec "64"/"128"/"256", plain numeric values are parsed
 *       as BigNumber automatically — bignumber() is rarely needed.
 *
 *     Examples:
 *       scope="{r:3, h:10}"
 *       scope="{v:math.unit(9.81 m/s^2), mass:80}"
 *       scope="{label:\"hello world\", n:42}"
 *
 * ── ⚠️  Reserved identifiers: e and i ────────────────────────────────
 * mathjs pre-defines "e" (Euler's number) and "i" (√−1).  Defining them
 * in the scope silently shadows those constants.  Use unambiguous names.
 *
 * Exported:
 *   buildScope(scopeAttr, wiki, math, normalizeModule)
 *     → scope object (may be {})
 */

(function () {
  "use strict";

  const lang = require("$:/plugins/nikorion/math/modules/lang.js");

  // ── Tiddler mode ──────────────────────────────────────────────────────
  function parseTiddlerScope(text, math, normalizeModule) {
    const scope = {};

    for (const rawLine of text.split("\n")) {
      const line     = rawLine.trim();
      if (!line)       continue; // blank
      const colonIdx = line.indexOf(":");
      if (colonIdx < 1) continue; // no colon → comment or malformed

      const name  = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (!name || !value) continue;

      try {
        const normalized = normalizeModule.normalize(value);
        scope[name] = math.evaluate(normalized, scope);
      } catch (e) {
        throw new Error(lang.getString("Errors/ScopeVar").replace("%1", name) + ": " + e.message);
      }
    }

    return scope;
  }

  // ── Inline mode helpers ───────────────────────────────────────────────

  /**
   * Strip the legacy "math." prefix from function calls.  mathjs's own
   * parser exposes its functions directly (unit, bignumber, …), so the
   * documented math.unit(…) / math.BigNumber(…) syntax keeps working:
   *
   *   math.unit(5 cm)       → unit(5 cm)
   *   math.BigNumber("1.5") → bignumber("1.5")
   *   math.Unit(…)          → unit(…)
   */
  function stripMathPrefix(s) {
    return s.replace(/\bmath\s*\.\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g, (_, fn) => {
      if (fn === "BigNumber") fn = "bignumber";
      if (fn === "Unit")      fn = "unit";
      return fn + "(";
    });
  }

  /**
   * Auto-quote unit() arguments that are not already quoted strings.
   *
   *   unit(5 cm)        → unit("5 cm")
   *   unit("5 cm")      → unit("5 cm")   (unchanged)
   *   unit(9.81 m/s^2)  → unit("9.81 m/s^2")
   */
  function autoQuoteUnitCalls(s) {
    return s.replace(/\bunit\(([^)]+)\)/g, (match, inner) => {
      const trimmed = inner.trim();
      if (/^["'].*["']$/.test(trimmed)) return match; // already quoted
      return `unit("${trimmed}")`;
    });
  }

  /**
   * Detect and normalize plain numeric values in the raw object literal
   * string before evaluation.  This makes thousands spaces ("1 000 000")
   * work in inline values — mathjs alone would reject "1 000 000" (implicit
   * multiplication of number literals).  ⚠️ Decimal commas are NOT
   * supported: input is EN notation only, consistent with the rest of the
   * plugin.
   *
   * Strategy: find every value that looks like a plain number literal
   * and pass it through normalize().  Values that are not bare numbers
   * (strings, unit()/bignumber() calls, arrays, booleans, null) are left
   * untouched.
   *
   * Returns the rewritten string, or throws with a key-prefixed message.
   */
  function normalizeInlineNumbers(raw, normalizeModule, _math) {
    // Replace each  key: value  pair.  We only attempt normalisation on
    // values that consist purely of number-like characters (digits, spaces,
    // commas, dots, +, -, e/E for scientific notation).
    // Anything more complex (function calls, strings, arrays) is left as-is.
    return raw.replace(
      /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*([^,}\]]+)/g,
      (match, key, val) => {
        const trimmed = val.trim();

        // Skip non-numeric values — strings, calls, arrays, booleans, null.
        if (/^["']|^math\.|^unit\(|^bignumber\(|^\[|^true$|^false$|^null$/.test(trimmed)) return match;

        // Only attempt if it looks like a number (digits + optional separators).
        if (!/^[+-]?[\d.,\s\u00A0\u2009\u202Fe]+$/i.test(trimmed)) return match;

        try {
          const normalized = normalizeModule.normalize(trimmed);
          // Sanity-check: after normalize, should be a valid number literal.
          if (isNaN(parseFloat(normalized))) return match;
          return match.replace(trimmed, normalized);
        } catch (e) {
          // Re-throw with key context.
          throw new Error(lang.getString("Errors/ScopeVar").replace("%1", key) + ": " + e.message);
        }
      }
    );
  }

  // ── Inline mode ───────────────────────────────────────────────────────
  function parseInlineScope(raw, math, normalizeModule) {
    let s = raw.trim();

    // Auto-wrap missing outer braces.
    if (!s.startsWith("{")) s = "{" + s;
    if (!s.endsWith("}"))   s = s + "}";

    // Normalize plain number literals (thousands spaces).
    s = normalizeInlineNumbers(s, normalizeModule, math);

    // Legacy math.* prefix → bare mathjs function names.
    s = stripMathPrefix(s);

    // Auto-quote unit() arguments.
    s = autoQuoteUnitCalls(s);

    // Evaluate the object literal with mathjs's OWN sandboxed parser.
    // Unlike the previous new Function approach, math.evaluate cannot run
    // arbitrary JavaScript (no prototype/constructor/global access) — an
    // imported tiddler can no longer execute code via the scope attribute.
    // Bonus: values may now be mathjs expressions (pi/4, sqrt(2), …), and
    // with calcPrec="64/128/256" numeric literals are BigNumber natively. 🛡️
    let result;
    try {
      result = math.evaluate(s);
    } catch (e) {
      throw new Error(
        lang.getString("Errors/InvalidInlineScope") + " (" + e.message + ")"
      );
    }

    // math.evaluate can return any value; only a plain object is a scope.
    if (!result || result.constructor !== Object) {
      throw new Error(lang.getString("Errors/InvalidInlineScope"));
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────
  // buildScope (exported) 🚀
  // ─────────────────────────────────────────────────────────────────────
  exports.buildScope = function buildScope(scopeAttr, wiki, math, normalizeModule) {
    if (!scopeAttr) return {};

    // Mode 1: tiddler exists → parse line by line.
    const tiddler = wiki.getTiddler(scopeAttr);
    if (tiddler) {
      const text = tiddler.fields.text ?? "";
      return text.trim()
        ? parseTiddlerScope(text, math, normalizeModule)
        : {};
    }

    // Mode 2: no tiddler → treat as inline JS-object literal.
    return parseInlineScope(scopeAttr, math, normalizeModule);
  };

})();