/*\
title: $:/plugins/nikorion/math/modules/normalize.js
type: application/javascript
module-type: library
\*/

(function(){

"use strict";

exports.normalize = function(expr, locale) {

	var s = expr.trim();

	s = s.replace(/\u202F|\u00A0/g, " ");

	if (locale === "fr-FR") {
		s = s
			.replace(/(\d),(\d)/g, "$1.$2")
			.replace(/×|·/g, "*")
			.replace(/10\^(-?\d+)/g, "1e$1");
	}

	return s;
};

})();