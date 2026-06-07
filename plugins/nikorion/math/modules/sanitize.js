/*\
title: $:/plugins/nikorion/math/modules/sanitize.js
type: application/javascript
module-type: library
\*/

(function(){

"use strict";

var math = require("$:/plugins/nikorion/math/modules/math.js");

// ---------------------------------------------------------------------------

function add(errors, obj) {
	errors.push(obj);
}

function isOperator(c) {
	return /[+\-*/^%]/.test(c);
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

exports.sanitize = function(expr) {

	var errors = [];

	if (!expr || expr.trim() === "") {
		add(errors, {
			code: "E000",
			type: "empty",
			message: "Empty expression",
			start: 0,
			end: 0,
			severity: 3
		});
		return errors;
	}

	// -----------------------------------------------------------------------
	// 1. PARENTHESES CHECK
	// -----------------------------------------------------------------------

	var stack = [];

	for (var i = 0; i < expr.length; i++) {

		if (expr[i] === "(") {
			stack.push(i);
		}

		if (expr[i] === ")") {

			if (stack.length === 0) {
				add(errors, {
					code: "E101",
					type: "syntax",
					message: "Unexpected closing parenthesis",
					start: i,
					end: i + 1,
					severity: 3
				});
			} else {
				stack.pop();
			}
		}
	}

	for (var j = 0; j < stack.length; j++) {
		add(errors, {
			code: "E102",
			type: "syntax",
			message: "Unclosed parenthesis",
			start: stack[j],
			end: stack[j] + 1,
			severity: 3
		});
	}

	// -----------------------------------------------------------------------
	// 2. LEADING OPERATOR
	// -----------------------------------------------------------------------

	var trimmed = expr.trim();
	var first = trimmed[0];

	if (isOperator(first) && first !== "+" && first !== "-") {
		add(errors, {
			code: "E201",
			type: "syntax",
			message: "Expression starts with invalid operator",
			start: 0,
			end: 1,
			severity: 3
		});
	}

	// -----------------------------------------------------------------------
	// 3. TRAILING OPERATOR
	// -----------------------------------------------------------------------

	var last = trimmed[trimmed.length - 1];

	if (isOperator(last)) {
		add(errors, {
			code: "E202",
			type: "syntax",
			message: "Expression ends with operator",
			start: expr.lastIndexOf(last),
			end: expr.length,
			severity: 3
		});
	}

	// -----------------------------------------------------------------------
	// 4. TOKEN ANALYSIS (functions, constants, units)
	// -----------------------------------------------------------------------

	var tokens = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];

	for (var k = 0; k < tokens.length; k++) {

		var t = tokens[k];
		var pos = expr.indexOf(t);

		// ------------------------------------------------------------
		// 1. math.js functions / constants
		// ------------------------------------------------------------
		if (typeof math[t] !== "undefined") continue;

		// ------------------------------------------------------------
		// 2. math.js units (IMPORTANT FIX)
		// ------------------------------------------------------------
		var isUnit = false;

		try {
			if (math.unit) {
				// test direct unit existence
				var u = math.unit("1 " + t);
				if (u) isUnit = true;
			}
		} catch (e) {
			isUnit = false;
		}

		if (isUnit) continue;

		// ------------------------------------------------------------
		// 3. fallback safe whitelist pattern
		// ------------------------------------------------------------
		if (/^[a-zA-Z]+$/.test(t)) {

			// second chance (some builds expose units differently)
			try {
				if (math.createUnit && math.unit("1 " + t)) {
					continue;
				}
			} catch (e) {}
		}

		// ------------------------------------------------------------
		// 4. UNKNOWN IDENTIFIER → ERROR
		// ------------------------------------------------------------
		add(errors, {
			code: "E301",
			type: "unknown",
			token: t,
			message: "Unknown identifier: \"" + t + "\"",
			start: pos,
			end: pos + t.length,
			severity: 2
		});
	}

	// -----------------------------------------------------------------------
	// 5. DEDUP + OVERLAP CLEANUP
	// -----------------------------------------------------------------------

	var filtered = [];

	for (var i = 0; i < errors.length; i++) {

		var e = errors[i];
		var keep = true;

		for (var j = 0; j < filtered.length; j++) {

			var f = filtered[j];

			if (e.start === f.start &&
				e.end === f.end &&
				e.type === f.type) {

				if (e.severity > f.severity) {
					filtered[j] = e;
				}

				keep = false;
				break;
			}
		}

		if (keep) filtered.push(e);
	}

	return filtered;
};

})();