/*\
title: $:/plugins/nikorion/math/modules/format.js
type: application/javascript
module-type: library
\*/

(function(){

"use strict";

var math = require("$:/plugins/nikorion/math/modules/math.js");

function sciFR(x) {

	var s = x.toExponential(3).split("e");

	var m = s[0].replace(".", ",");
	var e = parseInt(s[1], 10);

	return m + " × 10^" + e;
}

function formatUnits(result, locale) {

	if (!result || !result.units) return null;

	var v = result.value;

	var fmt = new Intl.NumberFormat(locale, {
		maximumFractionDigits: 12
	});

	var unit = result.units.map(function(u) {
		return u.unit.name;
	}).join("·");

	if (locale === "fr-FR") {
		unit = unit.replace(/\^2/g, "²").replace(/\^3/g, "³");
	}

	return fmt.format(v) + "\u202F" + unit;
}

exports.format = function(result, locale, options) {

	options = options || {};

	// scientific
	if (typeof result === "number") {

		var abs = Math.abs(result);

		if (options.scientific === "always") {
			return locale === "fr-FR" ? sciFR(result) : result.toExponential(3);
		}

		if (options.scientific === "auto") {
			if (abs < 1e-6 || abs > 1e12) {
				return locale === "fr-FR" ? sciFR(result) : result.toExponential(3);
			}
		}

		if (options.scientific === "never") {
			return new Intl.NumberFormat(locale, {
				maximumFractionDigits: 12
			}).format(result).replace(/ /g, "\u202F");
		}
	}

	// units
	var u = formatUnits(result, locale);
	if (u) return u;

	// fallback mathjs
	return math.format(result);
};

})();