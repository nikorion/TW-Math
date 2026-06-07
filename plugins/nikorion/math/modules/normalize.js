/*\
title: $:/plugins/nikorion/math/modules/normalize.js
type: application/javascript
module-type: library
\*/

/*
 * normalize.js — expression normalisation 🔄
 *
 * Converts a raw user expression into a form that mathjs can parse,
 * regardless of the typographic or locale conventions used.
 *
 * After this pass, the expression contains only ASCII math operators,
 * mathjs-recognised function names and identifiers, and standard decimal
 * points — the evaluator never sees locale-specific characters.
 *
 * ─────────────────────────────────────────────────────────────────────
 * 📐 A NOTE ON MATHEMATICAL NOTATION ACROSS COUNTRIES
 * ─────────────────────────────────────────────────────────────────────
 *
 * What is considered "international" notation (ISO 80000, used in most
 * English-language scientific literature and by mathjs) vs. what differs
 * notably by country — especially France:
 *
 * DECIMAL SEPARATOR
 *   International / EN : point        3.14
 *   France (everyday)  : comma        3,14
 *   France (academic)  : comma        3,14  (ISO 80000-1 allows both but
 *                                            France officially uses comma)
 *   Germany, Italy…    : comma        3,14
 *
 * THOUSANDS SEPARATOR
 *   International / EN : comma        1,000,000   (but also: none or space)
 *   France (everyday)  : space        1 000 000   (narrow no-break U+202F
 *                                                  or regular space)
 *   France (academic)  : thin space   1 000 000   (ISO 80000 recommends space)
 *   Germany            : period       1.000.000
 *
 * MULTIPLICATION SIGN
 *   International / EN : × (U+00D7) or · (U+00B7) or just juxtaposition
 *   France (everyday)  : × is common; the middle dot · is used for scalar
 *                        products and in compound units (m·s⁻¹)
 *   Academic           : · preferred to distinguish from variable x
 *
 * NOTE ON "x" AS MULTIPLICATION
 *   In informal/handwritten math (especially for younger students in FR),
 *   "x" is sometimes used as a multiplication sign (e.g. "3 x 4").
 *   This plugin does NOT perform that substitution — "x" is treated as
 *   a user variable, which is the standard mathjs behaviour and allows
 *   proper algebraic expressions like "f(x) = x^2".
 *
 * INTERVALS (France)
 *   France uses      [a ; b]  with a semicolon to avoid confusion with
 *   the decimal comma.  International notation uses [a, b] with a comma.
 *   mathjs does not natively support interval notation, so this is out
 *   of scope here, but worth knowing if you extend the plugin.
 *
 * AMBIGUOUS CASES handled by convention
 *   "1,234"  — could be 1.234 (FR decimal) or 1234 (EN thousands).
 *              → We treat a lone comma between digits as a decimal separator
 *                (FR convention) since EN thousands-comma is always paired
 *                with a decimal point in practice.
 *   "1.234"  — could be 1234 (DE/IT thousands) or 1.234 (EN decimal).
 *              → We treat a lone period as decimal (EN/international),
 *                which is the mathjs default and the safer assumption.
 *
 * ─────────────────────────────────────────────────────────────────────
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

  // ── Number-format normalisation ───────────────────────────────────────
  // Handles the locale-specific ways numbers are written so the result is
  // always a plain decimal that mathjs accepts.
  //
  // Step 1 — thousands separators (all whitespace variants between digits)
  //   Spaces used as thousands separators are unambiguously not decimal
  //   separators.  We collapse them regardless of locale. 🗜️
  //   Affected: U+0020 (space), U+00A0 (NBSP), U+2009 (thin space),
  //             U+202F (narrow NBSP — the ISO-recommended thousands sep).
  //
  // Step 2 — decimal / thousands comma+period pairs (deterministic)
  //   "1.234,56" → 1234.56  (period = thousands, comma = decimal — DE/IT)
  //   "1,234.56" → 1234.56  (comma = thousands, point = decimal — EN)
  //   Both patterns are unambiguous because two different separators appear.
  //
  // Step 3 — lone comma between digits (ambiguous, FR convention applied)
  //   "3,14"  → 3.14   treated as FR decimal comma.
  //   There is no fully deterministic solution when only one separator type
  //   is used.  The FR-decimal interpretation is chosen because:
  //     • In a math expression context, a lone comma rarely means thousands.
  //     • EN thousands-comma is almost always accompanied by a decimal point.
  //
  // Step 4 — lone period is left untouched (already mathjs-compatible). ✅
  function normalizeNumbers(s) {
    // Step 1: thousands spaces → remove (only between digit and digit)
    // Iterating handles "1 234 567" in multiple passes.
    let prev;
    do {
      prev = s;
      s = s.replace(/(\d)[\u0020\u00A0\u2009\u202F](\d)/g, "$1$2");
    } while (s !== prev);

    // Step 2a: period-thousands + comma-decimal  "1.234,56" → "1234.56"
    if (/\d\.\d{3},\d/.test(s)) {
      s = s.replace(/(\d)\.(\d{3}(?=[,\d]))/g, "$1$2");
      s = s.replace(/(\d),(\d)/g, "$1.$2");
      return s;
    }
    // Step 2b: comma-thousands + period-decimal  "1,234.56" → "1234.56"
    if (/\d,\d{3}\.\d/.test(s)) {
      s = s.replace(/(\d),(\d{3}(?=[.\d]))/g, "$1$2");
      return s;
    }

    // Step 3: lone comma between digits → FR decimal → period
    s = s.replace(/(\d),(\d)/g, "$1.$2");

    return s; // Step 4: lone period already correct
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
    s = s.replaceAll("\u03C0", "pi");            // π
    s = s.replaceAll("\u03C4", "(2*pi)");        // τ  (tau = 2π)
    s = s.replaceAll("\u221E", "Infinity");       // ∞
    s = s.replaceAll("\u212F", "e");             // ℯ (Euler e, U+212F)

    // ── 4. Superscript digits → ^ exponent ─────────────────────────────
    s = s.replace(SUPERSCRIPT_RE, (match) => {
      const digits = [...match].map(ch => SUPERSCRIPTS[ch]).join("");
      return "^" + digits;
    });

    // ── 5. Unicode operators → ASCII ───────────────────────────────────
    s = s
      .replaceAll("\u00D7", "*")   // ×  multiplication sign
      .replaceAll("\u00B7", "*")   // ·  middle dot (FR scalar product / unit separator)
      .replaceAll("\u00F7", "/")   // ÷  division sign
      .replaceAll("\u2212", "-")   // −  minus sign (U+2212, ≠ ASCII hyphen U+002D)
      .replaceAll("\u2013", "-")   // –  en dash (sometimes used as minus)
      .replaceAll("\u2010", "-");  // ‐  hyphen (U+2010)

    // ── 6. Degree symbol → mathjs 'deg' unit ───────────────────────────
    // mathjs understands 'deg' as an angular unit: 90 deg, sin(45 deg).
    // We insert a space before 'deg' to avoid "90deg" becoming "90deg"
    // (which also works in mathjs, but the space form is cleaner). 📐
    s = s.replace(/(\d)\u00B0/g, "$1 deg"); // °

    // ── 7. Number-format normalisation (locale-aware) ───────────────────
    s = normalizeNumbers(s);

    return s;
  };

})();
