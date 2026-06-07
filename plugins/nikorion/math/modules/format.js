/*\
title: $:/plugins/nikorion/math/modules/format.js
type: application/javascript
module-type: library
\*/

/*
 * format.js — result formatting 🎨
 *
 * Converts a mathjs evaluation result into a locale-aware display string.
 *
 * Supported result types:
 *   - Plain JS number  → Intl.NumberFormat (fully locale-aware)
 *   - mathjs Unit      → numeric value + unit symbol (locale-aware number)
 *   - anything else    → math.format() fallback (matrices, fractions…)
 *
 * Options:
 *   scientific {string}  "auto" | "always" | "never"
 *     auto   — scientific notation only for |x| < 1e-6 or |x| > 1e12
 *     always — always use scientific notation
 *     never  — always use decimal notation
 *
 * ── Unit formatting strategy ─────────────────────────────────────────
 * mathjs.toString() on a Unit always produces the "best" string:
 *   • simplifies compound dimensions  (kg·m²/s² → kJ)
 *   • respects explicit "to" conversions  (460V*20A*30days to kWh → 6624 kWh)
 *   • keeps the original unit for simple quantities  (100 kg → 100 kg)
 * We parse that string, reformat the numeric part with Intl, and reattach
 * the unit symbol.
 *
 * Exception 🚨: for single-component units WITHOUT an explicit "to"
 * conversion, mathjs may auto-reprefix to a "cleaner" SI prefix
 * (e.g. "1234.5 kg" → "1.2345 Mg").  We detect this via result.fixPrefix
 * and revert to the unit the user originally wrote.
 *
 * Exported:
 *   format(result, locale, options) → string
 */

(function () {
  "use strict";

  const math = require("$:/plugins/nikorion/math/modules/math.js");

  // ── French-style scientific notation ──────────────────────────────────
  // International standard uses × (U+00D7) and superscript — but since we
  // output plain text, we write "×" literally and "10^n" with a caret. 🔬
  // Example: 1.234e7 → "1,234 × 10^7"
  function sciFR(x) {
    const [mantissa, exp] = x.toExponential(3).split("e");
    return `${mantissa.replace(".", ",")} \u00D7 10^${parseInt(exp, 10)}`;
  }

  // ── Unit result formatter ─────────────────────────────────────────────
  // Returns null if result is not a mathjs Unit object.
  function formatUnit(result, locale) {
    if (!result?.units) return null;

    // Let mathjs produce the canonical "value unit" string.
    const str   = result.toString();
    const match = str.match(/^(-?[\d.]+(?:e[+\-]?\d+)?)\s*(.*)$/i);
    if (!match) return str; // unexpected format — return as-is

    let num         = parseFloat(match[1]);
    let displayUnit = match[2].trim();

    // Revert auto-reprefixing for single-unit results without "to". 🔙
    // (See module header for explanation.)
    if (!result.fixPrefix && result.units.length === 1) {
      const u        = result.units[0];
      const origUnit = u.prefix.name + u.unit.name + (u.power !== 1 ? `^${u.power}` : "");
      try {
        num         = result.toNumber(origUnit);
        displayUnit = origUnit;
      } catch {
        // toNumber() failed — keep mathjs toString() output
      }
    }

    // U+202F = narrow no-break space, conventional separator before unit symbols.
    const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 12 })
      .format(num).replace(/ /g, "\u202F");

    return displayUnit ? `${formatted}\u202F${displayUnit}` : formatted;
  }

  // ─────────────────────────────────────────────────────────────────────
  // format (exported) ✨
  // ─────────────────────────────────────────────────────────────────────
  exports.format = function format(result, locale, options = {}) {

    // ── Plain number ───────────────────────────────────────────────────
    if (typeof result === "number") {
      const abs = Math.abs(result);

      if (options.scientific === "always") {
        return locale === "fr-FR" ? sciFR(result) : result.toExponential(3);
      }
      if (options.scientific === "auto" && abs !== 0 && (abs < 1e-6 || abs > 1e12)) {
        return locale === "fr-FR" ? sciFR(result) : result.toExponential(3);
      }

      // "never" or "auto" with a normal-range value → decimal notation.
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 12 })
        .format(result).replace(/ /g, "\u202F");
    }

    // ── mathjs Unit ────────────────────────────────────────────────────
    const unitStr = formatUnit(result, locale);
    if (unitStr !== null) return unitStr;

    // ── Fallback: matrices, fractions, complex numbers… ────────────────
    return math.format(result, { notation: "fixed", precision: 12 });
  };

})();
