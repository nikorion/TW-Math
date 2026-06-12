/*\
title: $:/plugins/nikorion/math/modules/normalize.js
type: application/javascript
module-type: library
\*/

/*
 * normalize.js — expression normalisation 🔄
 *
 * Converts a raw user expression into a form that mathjs can parse.
 *
 * Input must use EN/international notation:
 *   • Decimal separator  : point       3.14
 *   • Thousands separator: space or none   1 000 000
 *   • Operators          : standard ASCII or the Unicode aliases below
 *
 * After this pass, the expression contains only ASCII math operators,
 * mathjs-recognised function names and identifiers, and standard decimal
 * points — the evaluator never sees locale-specific characters.
 *
 * Locale-aware formatting on OUTPUT (FR comma, space grouping…) is handled
 * separately by format.js and is independent of this input normalisation.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Transformations applied
 * ─────────────────────────────────────────────────────────────────────
 *
 *  1. Vulgar fractions    ½ → (1/2),  ¾ → (3/4), …
 *  2. Radical symbols     √x → sqrt(x),  ∛x → cbrt(x)
 *  3. Unicode constants   π → pi,  τ → (2*pi),  ∞ → Infinity,  ℯ → e
 *  4. Superscript digits  x² → x^2,  a³ → a^3
 *  5. Unicode operators   × → *,  · → *,  ÷ → /,  − → -,  – → -
 *  6. Degree symbol       90° → 90 deg
 *  7. Scientific spacing  5 e9 → 5e9
 *  8. Thousands spaces    1 000 000 → 1000000
 *     (U+0020, U+00A0, U+2009, U+202F between digits only)
 *
 * Exported:
 *   normalize(expr) → string
 */

(function () {
  "use strict";

  // ── Vulgar fractions → explicit ratio expressions ─────────────────────
  // These Unicode codepoints have an unambiguous mathematical meaning. 🍕
  const VULGAR_FRACTIONS = {
    "\u00BD": "(1/2)", "\u2153": "(1/3)", "\u2154": "(2/3)",
    "\u00BC": "(1/4)", "\u00BE": "(3/4)", "\u2155": "(1/5)",
    "\u2156": "(2/5)", "\u2157": "(3/5)", "\u2158": "(4/5)",
    "\u2159": "(1/6)", "\u215A": "(5/6)", "\u215B": "(1/8)",
    "\u215C": "(3/8)", "\u215D": "(5/8)", "\u215E": "(7/8)",
  };

  // ── Superscript digits → ^ exponent notation ──────────────────────────
  // e.g. x² → x^2,  a³ → a^3.  Multiple superscripts are collapsed:
  // x²³ → x^23 (meaning x to the power of 23, as written). 🔢
  const SUPERSCRIPTS = {
    "\u00B2": "2", "\u00B3": "3", "\u2070": "0", "\u00B9": "1",
    "\u2074": "4", "\u2075": "5", "\u2076": "6",
    "\u2077": "7", "\u2078": "8", "\u2079": "9",
  };
  const SUPERSCRIPT_RE = new RegExp("[" + Object.keys(SUPERSCRIPTS).join("") + "]+", "g");

  // ── Radical symbols → mathjs function calls ───────────────────────────
  // √token  → sqrt(token)   √(expr) → sqrt(expr)
  // ∛token  → cbrt(token)   ∛(expr) → cbrt(expr)
  // "token" here means a number literal or a bare identifier. 🌿
  function wrapRadical(s, symbol, fn) {
    // Case 1: radical followed by a parenthesised group → replace symbol only
    s = s.replace(new RegExp(symbol + "\\(", "g"), fn + "(");
    // Case 2: radical followed by a bare number or identifier
    s = s.replace(
      new RegExp(symbol + "([0-9]+\\.?[0-9]*|[a-zA-Z_][a-zA-Z0-9_]*)", "g"),
      (_, token) => `${fn}(${token})`
    );
    return s;
  }

  // ── Thousands-space removal ───────────────────────────────────────────
  // Strips spaces used as thousands separators (U+0020, U+00A0, U+2009,
  // U+202F) when they appear between two digit characters.
  // Iterates until stable to handle "1 234 567" in multiple passes. 🗜️
  function removeThousandsSpaces(s) {
    let prev;
    do {
      prev = s;
      s = s.replace(/(\d)[\u0020\u00A0\u2009\u202F](\d)/g, "$1$2");
    } while (s !== prev);
    return s;
  }

  // ─────────────────────────────────────────────────────────────────────
  // normalize (exported) 🚀
  // ─────────────────────────────────────────────────────────────────────
  exports.normalize = function normalize(expr) {
    let s = expr.trim();

    // ── 1. Vulgar fractions ─────────────────────────────────────────────
    for (const [ch, rep] of Object.entries(VULGAR_FRACTIONS)) {
      s = s.replaceAll(ch, rep);
    }

    // ── 2. Radical symbols ──────────────────────────────────────────────
    s = wrapRadical(s, "\u221A", "sqrt"); // √
    s = wrapRadical(s, "\u221B", "cbrt"); // ∛

    // ── 3. Unicode constants → mathjs names ────────────────────────────
    s = s.replaceAll("\u03C0", "pi");      // π
    s = s.replaceAll("\u03C4", "(2*pi)"); // τ  (tau = 2π)
    s = s.replaceAll("\u221E", "Infinity"); // ∞
    s = s.replaceAll("\u212F", "e");       // ℯ (Euler e, U+212F)

    // ── 4. Superscript digits → ^ exponent ─────────────────────────────
    s = s.replace(SUPERSCRIPT_RE, (match) => {
      const digits = [...match].map(ch => SUPERSCRIPTS[ch]).join("");
      return "^" + digits;
    });

    // ── 5. Unicode operators → ASCII ───────────────────────────────────
    s = s
      .replaceAll("\u00D7", "*")  // ×  multiplication sign
      .replaceAll("\u00B7", "*")  // ·  middle dot
      .replaceAll("\u00F7", "/")  // ÷  division sign
      .replaceAll("\u2212", "-")  // −  minus sign (U+2212, ≠ ASCII hyphen)
      .replaceAll("\u2013", "-")  // –  en dash
      .replaceAll("\u2010", "-"); // ‐  hyphen (U+2010)

    // ── 6. Degree symbol → mathjs 'deg' unit ───────────────────────────
    s = s.replace(/(\d)\u00B0/g, "$1 deg"); // °

    // ── 7. Scientific notation with stray space ────────────────────────
    // "5 e9" or "5 e-3" → "5e9" / "5e-3"
    // Never touches standalone 'e' (Euler constant) like "e + 9". 🔬
    s = s.replace(/(\d)\s+[eE]([+\-]?\d)/g, "$1e$2");

    // ── 8. Thousands spaces → remove ───────────────────────────────────
    s = removeThousandsSpaces(s);

    return s;
  };

})();