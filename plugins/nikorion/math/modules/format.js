/*\
title: $:/plugins/nikorion/math/modules/format.js
type: application/javascript
module-type: library
\*/

/*
 * format.js — result formatting
 *
 * Converts a mathjs evaluation result into a locale-aware display string.
 *
 * Exported:
 *   format(result, locale, options) → string
 *
 * Supported result types:
 *   - Plain JS number  → formatted with Intl.NumberFormat (respects locale)
 *   - mathjs Unit      → value + unit symbol, locale-aware number formatting
 *   - anything else    → delegated to math.format() (matrices, fractions…)
 *
 * Options:
 *   scientific {string}  "auto" | "always" | "never"
 *     auto   — scientific notation only for abs < 1e-6 or abs > 1e12
 *     always — always use scientific notation
 *     never  — always use decimal notation
 *
 * Unit formatting strategy:
 *   mathjs is trusted for unit simplification and "to" conversions.
 *   result.toString() always produces the right value+unit string (e.g.
 *   "39.24 kJ", "6624 kWh", "120 mm"). We parse that string, reformat the
 *   numeric part with Intl, and reattach the unit.
 *
 *   Exception: for single-unit results without an explicit "to" conversion,
 *   mathjs may auto-reprefix the unit (e.g. "1234.5 kg" → "1.2345 Mg").
 *   In that case we revert to the original unit the user wrote.
 */

(function(){

"use strict";

var math = require("$:/plugins/nikorion/math/modules/math.js");

// ---------------------------------------------------------------------------
// sciFR — French-style scientific notation  e.g. 1.234e7 → "1,234 × 10^7"
// ---------------------------------------------------------------------------

function sciFR(x) {
	var parts    = x.toExponential(3).split("e");
	var mantissa = parts[0].replace(".", ",");
	var exponent = parseInt(parts[1], 10);
	return mantissa + " \u00D7 10^" + exponent; // × = U+00D7
}

// ---------------------------------------------------------------------------
// formatUnit — format a mathjs Unit result (e.g. "9.81 m/s²", "6624 kWh")
//
// Returns null if the result is not a Unit object.
// ---------------------------------------------------------------------------

function formatUnit(result, locale) {

	if (!result || !result.units) return null;

	// mathjs.toString() handles unit simplification and "to" conversions
	// correctly in all cases — we only need to reformat the numeric part.
	var str   = result.toString();
	var match = str.match(/^(-?[\d.]+(?:e[+\-]?\d+)?)\s*(.*)$/i);
	if (!match) return str; // unexpected format — return as-is

	var num         = parseFloat(match[1]);
	var displayUnit = match[2].trim();

	// For single-unit results without an explicit "to" conversion, mathjs may
	// auto-reprefix to a "prettier" SI prefix (e.g. kg → Mg for large values).
	// Revert to the unit the user actually wrote to avoid surprising output.
	if (!result.fixPrefix && result.units.length === 1) {
		var u        = result.units[0];
		var origUnit = u.prefix.name + u.unit.name;
		if (u.power !== 1) origUnit += "^" + u.power;
		try {
			num         = result.toNumber(origUnit);
			displayUnit = origUnit;
		} catch(e) {
			// toNumber() failed (should not happen) — keep mathjs toString output
		}
	}

	// Reformat the numeric part with Intl, then reattach the unit.
	// U+202F (narrow no-break space) is the conventional separator before units.
	var fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 12 });
	var formattedNum = fmt.format(num).replace(/ /g, "\u202F");

	return displayUnit ? formattedNum + "\u202F" + displayUnit : formattedNum;
}

// ---------------------------------------------------------------------------
// format (exported)
// ---------------------------------------------------------------------------

exports.format = function(result, locale, options) {

	options = options || {};

	// --- Plain number ---
	if (typeof result === "number") {

		var abs = Math.abs(result);

		if (options.scientific === "always") {
			return locale === "fr-FR" ? sciFR(result) : result.toExponential(3);
		}

		// "auto": scientific notation only for very large or very small values.
		if (options.scientific === "auto" && abs !== 0 && (abs < 1e-6 || abs > 1e12)) {
			return locale === "fr-FR" ? sciFR(result) : result.toExponential(3);
		}

		// "never" or "auto" with a normal-range value: decimal notation.
		return new Intl.NumberFormat(locale, {
			maximumFractionDigits: 12
		}).format(result).replace(/ /g, "\u202F");
	}

	// --- mathjs Unit ---
	var unitStr = formatUnit(result, locale);
	if (unitStr !== null) return unitStr;

	// --- Fallback: matrices, fractions, complex numbers, etc. ---
	return math.format(result, { notation: "fixed", precision: 12 });
};

})();