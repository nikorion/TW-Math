/*\
title: $:/plugins/nikorion/math/modules/format.js
type: application/javascript
module-type: library
\*/

/*
 * format.js — number/unit formatting
 *
 * Converts a mathjs evaluation result into a locale-aware display string.
 *
 * Exported:
 *   format(result, locale, options) → string
 *
 * Supported result types:
 *   - Plain JS number  → formatted with Intl.NumberFormat (respects locale)
 *   - mathjs Unit      → numeric value + unit symbol, formatted with Intl
 *   - anything else    → delegated to math.format() (matrices, fractions, complex…)
 *
 * Options:
 *   scientific {string}  "auto" | "always" | "never"
 *     auto   — scientific notation only for abs < 1e-6 or abs > 1e12
 *     always — always use scientific notation
 *     never  — always use decimal notation, regardless of magnitude
 */

(function(){

"use strict";

var math = require("$:/plugins/nikorion/math/modules/math.js");

// ---------------------------------------------------------------------------
// sciFR — French-style scientific notation
// Example: 1.234e7  →  "1,234 × 10^7"
// ---------------------------------------------------------------------------

function sciFR(x) {
	var parts    = x.toExponential(3).split("e");
	var mantissa = parts[0].replace(".", ",");
	var exponent = parseInt(parts[1], 10);
	return mantissa + " \u00D7 10^" + exponent; // × is U+00D7
}

// ---------------------------------------------------------------------------
// formatUnits — format a mathjs Unit result (e.g. "9.81 m/s²")
// Returns null if the result is not a Unit object.
// ---------------------------------------------------------------------------

function formatUnits(result, loc) {

	if (!result || !result.units) return null;

	var fmt  = new Intl.NumberFormat(loc, { maximumFractionDigits: 12 });
	var unit = result.units.map(function(u) { return u.unit.name; }).join("\u00B7"); // · U+00B7

	// Replace ASCII exponent syntax with Unicode superscripts for fr-FR display.
	if (loc === "fr-FR") {
		unit = unit.replace(/\^2/g, "\u00B2").replace(/\^3/g, "\u00B3");
	}

	// U+202F = narrow no-break space, conventional before unit symbols
	return fmt.format(result.value) + "\u202F" + unit;
}

// ---------------------------------------------------------------------------
// format (exported)
// ---------------------------------------------------------------------------

exports.format = function(result, loc, options) {

	options = options || {};

	// --- Plain number ---
	if (typeof result === "number") {

		var abs = Math.abs(result);

		if (options.scientific === "always") {
			return loc === "fr-FR" ? sciFR(result) : result.toExponential(3);
		}

		// "auto": use scientific notation only for very large or very small values.
		if (options.scientific === "auto" && abs !== 0 && (abs < 1e-6 || abs > 1e12)) {
			return loc === "fr-FR" ? sciFR(result) : result.toExponential(3);
		}

		// "never", or "auto" with a normal-range value: always use decimal notation.
		// Intl replaces regular spaces with narrow no-break spaces for grouping.
		return new Intl.NumberFormat(loc, {
			maximumFractionDigits: 12
		}).format(result).replace(/ /g, "\u202F");
	}

	// --- mathjs Unit (e.g. result of "9.81 m/s^2") ---
	var unitStr = formatUnits(result, loc);
	if (unitStr) return unitStr;

	// --- Fallback: matrices, fractions, complex numbers, etc. ---
	// Intl cannot be applied here; delegate to mathjs own formatter.
	return math.format(result, { notation: "fixed", precision: 12 });
};

})();