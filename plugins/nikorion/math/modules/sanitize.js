/*\
title: $:/plugins/nikorion/math/modules/sanitize.js
type: application/javascript
module-type: library
\*/

(function(){

"use strict";

var ALLOWED = {
	abs: true,
	sqrt: true,
	sin: true,
	cos: true,
	tan: true,
	log: true,
	log10: true,
	exp: true,
	pow: true
};

exports.sanitize = function(expr) {

	if (expr.includes("window") || expr.includes("process")) {
		throw new Error("Expression interdite");
	}

	var tokens = expr.match(/[a-zA-Z_]+/g) || [];

	for (var i = 0; i < tokens.length; i++) {

		var t = tokens[i];

		if (ALLOWED[t]) continue;
		if (typeof math !== "undefined" && math[t]) continue;

		if (/[a-zA-Z]/.test(t)) {
			throw new Error("Fonction non autorisée: " + t);
		}
	}

	return expr;
};

})();