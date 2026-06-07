/*\
title: $:/plugins/nikorion/math/modules/normalize.js
type: application/javascript
module-type: library
\*/

/*
 * normalize.js — expression normalisation
 *
 * Converts a raw user expression into a form that mathjs can parse,
 * depending on the detected or specified input locale.
 *
 * Exported:
 *   normalize(expr, locale) → string
 *
 * Transformations applied unconditionally:
 *   - Trim leading/trailing whitespace.
 *   - Replace narrow no-break space (U+202F) and non-breaking space (U+00A0)
 *     with a regular space, so that thousands separators do not confuse mathjs.
 *   - Replace "x" / "X" used as a multiplication sign with "*".
 *     This widget is numeric-only (no symbolic algebra), so "x" is never a
 *     variable — it is always an informal multiplication operator.
 *     "1x2" → "1*2",  "3 x 4" → "3 * 4"
 *
 * Transformations applied for fr-FR only:
 *   - Decimal comma → decimal point:       "3,14"  → "3.14"
 *   - FR multiplication signs → asterisk:  "×" "·" → "*"
 *   - FR scientific notation → JS form:    "10^6"  → "1e6"
 *                                          "10^-3" → "1e-3"
 */

(function(){

"use strict";

exports.normalize = function(expr, locale) {

	var s = expr.trim();

	// Replace typographic spaces with a plain space so that mathjs does not
	// trip on thousands separators (e.g. "1 000" with a narrow no-break space).
	s = s.replace(/\u202F|\u00A0/g, " ");

	// Replace "x" / "X" with "*".
	// This widget handles numeric expressions only — there are no variables,
	// so "x" is always an informal multiplication sign.
	s = s.replace(/x/gi, "*");

	if (locale === "fr-FR") {

		// Decimal comma → decimal point (only between two digits).
		s = s.replace(/(\d),(\d)/g, "$1.$2");

		// FR multiplication operators → standard asterisk.
		s = s.replace(/[×·]/g, "*");

		// FR power-of-ten notation → JS exponential literal.
		// "10^6" → "1e6",  "10^-3" → "1e-3"
		s = s.replace(/10\^(-?\d+)/g, "1e$1");
	}

	return s;
};

})();