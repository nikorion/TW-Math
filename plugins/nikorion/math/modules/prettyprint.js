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
 * Used by the <$calc> widget when output="text" and show="formula"
 * or show="full".
 *
 * ── Transformations applied ───────────────────────────────────────────
 *
 *  1. Constants       pi → π   tau → τ   Infinity → ∞   e (lone) → ℯ
 *  2. Functions       sqrt(…) → √(…)   cbrt(…) → ∛(…)
 *                     factorial(n) → n!
 *                     log10(x) → log₁₀(x)   log2(x) → log₂(x)
 *  3. Operators       * → ·
 *  4. Exponents       x^2 → x²   x^23 → x²³   (superscript digits)
 *                     multi-digit exponents and parenthesised bases supported
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
 *   prettyprint(normalizedExpr) → string
 */

(function () {
  "use strict";

  // ── Superscript digit map ─────────────────────────────────────────────
  const SUPERSCRIPT_DIGITS = {
    "0": "\u2070", "1": "\u00B9", "2": "\u00B2", "3": "\u00B3",
    "4": "\u2074", "5": "\u2075", "6": "\u2076",
    "7": "\u2077", "8": "\u2078", "9": "\u2079",
    "-": "\u207B",
  };

  function toSuperscript(str) {
    return [...str].map(ch => SUPERSCRIPT_DIGITS[ch] ?? ch).join("");
  }

  // ── Subscript digit map ───────────────────────────────────────────────
  const SUBSCRIPT_DIGITS = {
    "0": "\u2080", "1": "\u2081", "2": "\u2082", "3": "\u2083",
    "4": "\u2084", "5": "\u2085", "6": "\u2086",
    "7": "\u2087", "8": "\u2088", "9": "\u2089",
  };

  function toSubscript(str) {
    return [...str].map(ch => SUBSCRIPT_DIGITS[ch] ?? ch).join("");
  }

  // ─────────────────────────────────────────────────────────────────────
  // prettyprint (exported) 🖋️
  // ─────────────────────────────────────────────────────────────────────
  exports.prettyprint = function prettyprint(expr) {
    let s = expr;

    // ── 1. Named constants ─────────────────────────────────────────────
    // Match only when not preceded or followed by an identifier character,
    // to avoid clobbering e.g. "exp" (contains "e") or "pirate".
    s = s.replace(/\bpi\b/g,       "\u03C0"); // π
    s = s.replace(/\btau\b/g,      "\u03C4"); // τ
    s = s.replace(/\bInfinity\b/g, "\u221E"); // ∞
    // "e" alone: only when surrounded by non-identifier characters.
    // This avoids touching "e" inside words like "exp", "euler", "energy".
    s = s.replace(/(?<![a-zA-Z0-9_$])e(?![a-zA-Z0-9_$])/g, "\u212F"); // ℯ

    // ── 2. Functions ───────────────────────────────────────────────────

    // sqrt(…) → √(…)
    s = s.replace(/\bsqrt\(/g, "\u221A(");  // √

    // cbrt(…) → ∛(…)
    s = s.replace(/\bcbrt\(/g, "\u221B(");  // ∛

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
    // Replace * with · (middle dot, U+00B7).
    // Exclude ** (power — not used by mathjs but defensive).
    s = s.replace(/\*(?!\*)/g, "\u00B7"); // ·

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
