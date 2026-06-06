/*\
title: $:/plugins/nikorion/math/modules/cache.js
type: application/javascript
module-type: library
\*/

(function(){

"use strict";

var MAX = 200;
var cache = new Map();

exports.get = function(k) {
	if (!cache.has(k)) return null;

	var v = cache.get(k);
	cache.delete(k);
	cache.set(k, v);
	return v;
};

exports.set = function(k, v) {

	if (cache.size >= MAX) {
		cache.delete(cache.keys().next().value);
	}

	cache.set(k, v);
};

exports.key = function(tid, expr, locale, mode) {
	return tid + "::" + locale + "::" + mode + "::" + expr;
};

exports.clear = function(tid) {

	for (var k of cache.keys()) {
		if (k.indexOf(tid + "::") === 0) {
			cache.delete(k);
		}
	}
};

})();