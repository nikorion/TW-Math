/*\
title: $:/plugins/nikorion/math/modules/prettyprint.js
type: application/javascript
module-type: library
\*/

/*
 * prettyprint.js — text-mode formula pretty-printer 🖋️
 *
 * Converts a normalized mathjs expression string into a readable
 * plain-text formula using standard mathematical symbols, without
 * evaluating the expression.
 *
 * Used by the <$math> widget when output="text" and show="formula"
 * or show="full".
 *
 * ── Transformations applied ───────────────────────────────────────────
 *
 *  0. Number grouping  integers/decimals with 4+ digits get NNBSP (U+202F)
 *                      as thousands separator; decimal separator follows the `decimal` attribute.
 *  0.7 Sci. notation  1.2e70 → 1.2 × 10⁷⁰   (ISO 80000-1 × for powers of 10)
 *  1. Constants        pi → π   tau → τ   Infinity → ∞   e (lone) → ℯ
 *  2. Functions        sqrt(…) → √(…)   cbrt(…) → ∛(…)
 *                      factorial(n) → n!
 *                      log10(x) → log₁₀(x)   log2(x) → log₂(x)
 *  3. Operators        * → ·
 *  4. Exponents        x^2 → x²   x^23 → x²³   (superscript digits)
 *                      multi-digit exponents and parenthesised bases supported
 *
 * ── What is NOT transformed ───────────────────────────────────────────
 *  • Division `/` — kept as-is (fraction bar not representable in plain text)
 *  • Unknown functions — kept as-is (e.g. sin(x), cos(x), log(x))
 *  • Parentheses — kept as-is
 *
 * ── Input ─────────────────────────────────────────────────────────────
 * Expects a string that has already been through normalize() — i.e.
 * Unicode operators have been converted to ASCII, vulgar fractions
 * expanded, etc.  The output is for display only — it is not parseable
 * back by mathjs.
 *
 * Exported:
 *   prettyprint(normalizedExpr, locale) → string
 *     locale: internal BCP-47 tag derived from the `decimal` widget attribute.
 *             Optional — defaults to EN style (decimal point).
 */

(function () {
  "use strict";

  var NNBSP = " "; // NARROW NO-BREAK SPACE (U+202F) — ISO 80000-1

  // ── Superscript digit map ─────────────────────────────────────────────
  const SUPERSCRIPT_DIGITS = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³",
    "4": "⁴", "5": "⁵", "6": "⁶",
    "7": "⁷", "8": "⁸", "9": "⁹",
    "-": "⁻",
  };

  function toSuperscript(str) {
    return [...str].map(ch => SUPERSCRIPT_DIGITS[ch] ?? ch).join("");
  }

  // ── Subscript digit map ───────────────────────────────────────────────
  const SUBSCRIPT_DIGITS = {
    "0": "₀", "1": "₁", "2": "₂", "3": "₃",
    "4": "₄", "5": "₅", "6": "₆",
    "7": "₇", "8": "₈", "9": "₉",
  };

  function toSubscript(str) {
    return [...str].map(ch => SUBSCRIPT_DIGITS[ch] ?? ch).join("");
  }

  // ── Number formatting helper ──────────────────────────────────────────
  // Adds NNBSP every 3 digits on the integer part; converts decimal
  // separator according to locale for FR.
  function formatNumInExpr(numStr, isFR) {
    var dotIdx = numStr.indexOf(".");
    var intPart, fracPart;
    if (dotIdx === -1) {
      intPart = numStr;
      fracPart = null;
    } else {
      intPart  = numStr.slice(0, dotIdx);
      fracPart = numStr.slice(dotIdx + 1);
    }
    var grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
    if (fracPart === null) return grouped;
    return grouped + (isFR ? "," : ".") + fracPart;
  }

  // ─────────────────────────────────────────────────────────────────────
  // prettyprint (exported) 🖋️
  // ─────────────────────────────────────────────────────────────────────
  exports.prettyprint = function prettyprint(expr, locale) {
    var isFR = locale === "fr-FR";
    var s = expr;

    // ── 0. Number grouping: NNBSP thousands on literals with 4+ digits ──
    // Lookbehind excludes: letters/digits (mid-identifier), ^ (exponent).
    // Lookahead excludes: eE+digit (scientific notation like 1000e6), bare
    // digits (mid-number), and _ (identifier). Unit letters (kg, m, s…) are
    // intentionally allowed so "1000000kg" groups the number correctly.
    // Runs BEFORE exponent conversion so 1000^2 → "1 000^2" → "1 000²".
    s = s.replace(
      /(?<![a-zA-Z_\d^])(\d{4,}(?:\.\d+)?)(?![eE][-+]?\d|\d|_)/g,
      function(_, numStr) { return formatNumInExpr(numStr, isFR); }
    );

    // ── 0.5. Number–unit separator: NNBSP between digit and unit letter ──
    // Handles "1 000 000kg" → "1 000 000 kg" and "100m" → "100 m".
    // Excludes eE followed by digit/sign (scientific notation: 3.14e6 intact).
    s = s.replace(/(\d)(?![eE][-+]?\d)([a-zA-Z])/g, "$1" + NNBSP + "$2");

    // ── 0.7. Scientific notation literals: 1.2e70 → 1.2 × 10⁷⁰ ─────────
    // Runs before constant substitution so the exponent 'e' is consumed here
    // and not touched by the lone-e → ℯ rule (step 1).
    // parseInt strips any leading '+' on positive exponents (e+70 → 10⁷⁰).
    s = s.replace(/(\d+(?:\.\d+)?)[eE]([-+]?\d+)/g, function(_, mantissa, expStr) {
      var exp = parseInt(expStr, 10);
      if (exp === 0) return mantissa;
      return mantissa + NNBSP + "×" + NNBSP + "10" + toSuperscript(String(exp));
    });

    // ── 1. Named constants ─────────────────────────────────────────────
    // Match only when not preceded or followed by an identifier character,
    // to avoid clobbering e.g. "exp" (contains "e") or "pirate".
    s = s.replace(/\bpi\b/g,       "π"); // π
    s = s.replace(/\btau\b/g,      "τ"); // τ
    s = s.replace(/\bInfinity\b/g, "∞"); // ∞
    // "e" alone: only when surrounded by non-identifier characters.
    // This avoids touching "e" inside words like "exp", "euler", "energy".
    s = s.replace(/(?<![a-zA-Z0-9_$])e(?![a-zA-Z0-9_$])/g, "ℯ"); // ℯ

    // ── 2. Functions ───────────────────────────────────────────────────

    // sqrt(…) → √(…)
    s = s.replace(/\bsqrt\(/g, "√(");  // √

    // cbrt(…) → ∛(…)
    s = s.replace(/\bcbrt\(/g, "∛(");  // ∛

    // log10(…) → log₁₀(…)
    s = s.replace(/\blog10\(/g, "log" + toSubscript("10") + "(");

    // log2(…) → log₂(…)
    s = s.replace(/\blog2\(/g, "log" + toSubscript("2") + "(");

    // factorial(n) → n!
    // The argument is everything inside the outer parens — handles simple
    // identifiers and numeric literals.  Nested parens are not supported
    // (rare in practice for factorial).
    s = s.replace(/\bfactorial\(([^)]+)\)/g, "$1!");

    // ── 3. Multiplication operator ─────────────────────────────────────
    // Replace * with NNBSP · NNBSP (ISO 80000-1: thin spaces around ·).
    // Exclude ** (power — not used by mathjs but defensive).
    s = s.replace(/\*(?!\*)/g, NNBSP + "·" + NNBSP);

    // ── 4. Exponents: x^n → xⁿ ────────────────────────────────────────
    // Handles:
    //   simple token ^ integer      r^2  →  r²
    //   parenthesised base ^ int    (a+b)^2  →  (a+b)²
    //   negative exponents          x^-1  →  x⁻¹
    //   multi-digit exponents       x^23  →  x²³
    //
    // Strategy: scan left-to-right, find ^ and convert the exponent.
    // The base is left as-is (already rendered by previous passes).
    s = s.replace(/\^(-?\d+)/g, (_, exp) => toSuperscript(exp));

    return s;
  };

})();
