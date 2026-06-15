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
 *   • Decimal separator  : point           3.14
 *   • Thousands separator: space or comma  1 000 000  1,000,000
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
 *  6. Degree symbol       90° or 90 ° → 90 deg  (optional space before °)
 *  7. Thousands separators  1 000 000 → 1000000  /  1,000,000 → 1000000
 *     spaces: U+0020, U+00A0, U+2009, U+202F between digits only
 *     comma:  only when flanked by exactly 3 digits on the right (EN style)
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

  // ── Thousands separator removal ───────────────────────────────────────
  // Strips spaces and EN-style commas used as thousands separators.
  //
  // Spaces (U+0020, U+00A0, U+2009, U+202F): removed whenever they appear
  // between two digit characters.  Iterates until stable to handle
  // "1 234 567" in multiple passes. 🗜️
  //
  // Commas: only stripped when the pattern matches EN thousands grouping —
  // a comma followed by exactly 3 digits and then a non-digit (or end).
  // This avoids clobbering function-argument commas like max(1,5).
  function removeThousandsSeparators(s) {
    // Pass 1 — comma thousands separators (EN style: \d,\d{3}\b)
    // Repeat until stable for chained groups: "1,234,567"
    let prev;
    do {
      prev = s;
      s = s.replace(/(\d),(\d{3})(?!\d)/g, "$1$2");
    } while (s !== prev);

    // Pass 2a — U+202F (NARROW NO-BREAK SPACE): strip everywhere.
    // Appears as thousands sep between digits, or as ISO thin space around ×
    // in formatted scientific output — neither role is meaningful for mathjs.
    s = s.replace(/\u202F/g, "");

    // Pass 2b — other space variants: strip only between digits (thousands seps).
    do {
      prev = s;
      s = s.replace(/(\d)[\u0020\u00A0\u2009](\d)/g, "$1$2");
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
    s = s.replace(/(\d)[\u0020\u00A0\u2009\u202F]?\u00B0/g, "$1 deg"); // °  (optional space before °)

    // ── 7. Thousands separators → remove ───────────────────────────────
    s = removeThousandsSeparators(s);

    return s;
  };

})();