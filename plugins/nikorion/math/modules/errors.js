/*\
title: $:/plugins/nikorion/math/modules/errors.js
type: application/javascript
module-type: library
\*/

/*
 * errors.js — result checking & error message rewriting 💬
 *
 * checkResult(result) → null | string
 *   Detects invalid numeric results that mathjs returns silently instead
 *   of throwing: Infinity, -Infinity, NaN — for both native numbers
 *   (calcPrec="float") and BigNumber results ("64"/"128"/"256").
 *   Also catches finite BigNumbers whose magnitude exceeds the float64
 *   range, since format.js displays via toNumber().
 *   Complex numbers are NOT flagged — they are valid results displayed
 *   normally by format.js.
 *   Returns an error message string, or null if the result is valid.
 *
 * rewriteError(msg, expr) → string
 *   Turns cryptic mathjs error messages into plain English.
 *   `expr` is the original (pre-normalisation) expression, used to
 *   display the character near a syntax error position.
 *
 * Exported:
 *   checkResult(result)      → null | string
 *   rewriteError(msg, expr)  → string
 */

(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────────────
  // checkResult
  // ─────────────────────────────────────────────────────────────────────
  exports.checkResult = function checkResult(result) {
    if (typeof result === "number") {
      if (result ===  Infinity) return "Result is +\u221E \u2014 division by zero or overflow";
      if (result === -Infinity) return "Result is \u2212\u221E \u2014 division by zero or overflow";
      if (isNaN(result))        return "Result is undefined \u2014 likely 0\u20440 or \u221E\u2212\u221E";
    }

    // BigNumber results (calcPrec = "64"/"128"/"256"): mathjs returns
    // BigNumber NaN / ±Infinity silently, exactly like native numbers.
    // ⚠️ Check NaN first — a NaN BigNumber is also non-finite.
    if (result?.isBigNumber) {
      if (result.isNaN())     return "Result is undefined \u2014 likely 0\u20440 or \u221E\u2212\u221E";
      if (!result.isFinite()) return result.isNegative()
        ? "Result is \u2212\u221E \u2014 division by zero or overflow"
        : "Result is +\u221E \u2014 division by zero or overflow";
      // Finite as a BigNumber, but overflows float64 — format.js would
      // silently display "∞" after toNumber().
      if (!Number.isFinite(result.toNumber()))
        return "Result is too large to display (exceeds the float64 range of \u00B11.8\u00D710^308)";
    }

    return null;
  };

  // ─────────────────────────────────────────────────────────────────────
  // rewriteError
  //
  // Regexes are written against the REAL typed-function messages:
  //   Too few:   "Too few arguments in function add
  //               (expected: number or BigNumber, index: 1)"
  //               → expected is a TYPE LIST, index = args provided (0-based
  //                 position of the first missing argument).
  //   Too many:  "Too many arguments in function atan2
  //               (expected: 2, actual: 3)"  → expected IS a number here.
  //   Bad type:  "Unexpected type of argument in function sqrt
  //               (expected: number or Complex or ..., actual: Date, index: 0)"
  // ─────────────────────────────────────────────────────────────────────
  exports.rewriteError = function rewriteError(msg, originalExpr) {
    if (!msg) return "Unknown error";

    let m;

    if ((m = msg.match(/[Uu]ndefined symbol\s+(\S+)/)))
      return `Unknown function or constant: "${m[1]}"`;

    if ((m = msg.match(/[Tt]oo few arguments in function (\w+)\s*\(expected:\s*([^,]+),\s*index:\s*(\d+)/)))
      return `${m[1]}() is missing an argument \u2014 argument ${parseInt(m[3], 10) + 1} should be a ${m[2]}`;

    if ((m = msg.match(/[Tt]oo many arguments.*?(\w+)\s*\(expected:\s*(\d+),\s*actual:\s*(\d+)/)))
      return `${m[1]}() takes ${m[2]} argument${m[2] === "1" ? "" : "s"} but ${m[3]} were given`;

    if ((m = msg.match(/[Uu]nexpected type of argument in function (\w+)\s*\(expected:\s*([^,]+),\s*actual:\s*([^,)]+)/)))
      return `${m[1]}() expects a ${m[2]} but received a ${m[3]}`;

    if ((m = msg.match(/char(?:acter)?\s+(\d+)/i))) {
      const pos = parseInt(m[1], 10);
      const ch  = originalExpr?.[pos - 1];
      return `Syntax error at position ${pos}${ch ? ` (near "${ch}")` : ""}`;
    }

    if (/unexpected end/i.test(msg))
      return "Unexpected end of expression \u2014 is the expression complete?";

    if ((m = msg.match(/[Uu]nexpected token\s+['"]?([^'"\s,]+)/)))
      return `Unexpected "${m[1]}" in expression`;

    return msg.replace(/\s*\(char \d+\)/g, "").replace(/\s*at index \d+/g, "").trim();
  };

})();