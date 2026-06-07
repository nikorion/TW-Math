/*\
title: $:/plugins/nikorion/math/modules/locale.js
type: application/javascript
module-type: library
\*/

/*
 * locale.js — input locale detection
 *
 * Analyses a raw math expression and guesses whether it uses French (fr-FR)
 * or English (en-US) number notation, based on a simple scoring heuristic.
 *
 * Exported:
 *   detect(expr) → "fr-FR" | "en-US" | "MIXED"
 *
 * Scoring rules (higher score wins):
 *
 *   FR indicators (+points):
 *     \d,\d          digit-comma-digit → decimal comma (e.g. 3,14)        +3
 *     [×·]           multiplication symbols                                +2
 *     10\^[-+]?\d+   FR scientific notation (e.g. 10^6)                   +1
 *     \d[NNBS]\d{3}  narrow/non-breaking space as thousands separator      +1
 *
 *   EN indicators (+points):
 *     \d\.\d         digit-dot-digit → decimal point (e.g. 3.14)          +3
 *     \d[eE][+-]?\d  scientific notation (e.g. 6.02e23)                   +2
 *     \*             asterisk multiplication operator                       +1
 *
 * Note: a bare comma (e.g. in function calls like pow(2,3)) is NOT counted
 * as a FR indicator — only a comma between two digits triggers the rule.
 *
 * Returns "MIXED" when both FR and EN indicators are present, which most
 * likely signals a user input error.
 */

(function(){

"use strict";

exports.detect = function(expr) {

	var fr = 0;
	var en = 0;

	// FR: decimal comma — only between two digits to avoid matching "pow(2,3)".
	if (/\d,\d/.test(expr))             fr += 3;

	// FR: explicit multiplication operators used in French math typography.
	if (/[×·]/.test(expr))              fr += 2;

	// FR: scientific notation written as "10^n" rather than "en".
	if (/10\^[-+]?\d+/.test(expr))      fr += 1;

	// FR: thousands separator — narrow no-break space (U+202F) or
	// non-breaking space (U+00A0) followed by exactly three digits.
	if (/\d[\u202F\u00A0]\d{3}/.test(expr)) fr += 1;

	// EN: decimal point between two digits.
	if (/\d\.\d/.test(expr))            en += 3;

	// EN: standard scientific notation (e.g. 1.5e-10, 6E23).
	if (/\d[eE][+\-]?\d+/.test(expr))  en += 2;

	// EN: asterisk as multiplication operator.
	if (/\*/.test(expr))                en += 1;

	if (fr > 0 && en > 0) return "MIXED";

	return fr > en ? "fr-FR" : "en-US";
};

})();