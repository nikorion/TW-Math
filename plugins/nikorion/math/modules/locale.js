/*\
title: $:/plugins/nikorion/math/modules/locale.js
type: application/javascript
module-type: library
\*/

(function(){

"use strict";

exports.detect = function(expr) {

	var fr = 0, en = 0;

	if (/,/.test(expr)) fr++;
	if (/×|·/.test(expr)) fr += 2;
	if (/10\^/.test(expr)) fr++;
	if (/\d,\d/.test(expr)) fr += 2;

	if (/\d\.\d/.test(expr)) en += 2;
	if (/\de[-+]?\d+/i.test(expr)) en += 2;
	if (/\*/.test(expr)) en++;

	if (fr > 0 && en > 0) return "MIXED";

	return fr > en ? "fr-FR" : "en-US";
};

})();