/*\
title: $:/plugins/nikorion/math/modules/sanitize.js
type: application/javascript
module-type: library
\*/

/*
 * sanitize.js — static expression validation
 *
 * Runs lightweight checks on a normalised expression BEFORE passing it to
 * mathjs, in order to produce precise, user-friendly error messages.
 *
 * Exported:
 *   sanitize(expr) → expr  (returns the expression unchanged if valid)
 *
 * Checks performed (in order):
 *   1. Empty expression
 *   2. Unbalanced parentheses — reports count or exact position
 *   3. Trailing binary operator  (e.g. "1 +")
 *   4. Leading binary operator   (e.g. "* 2")
 *   5. Unknown identifiers — every alphabetic token must exist in mathjs.
 *      If the token is close to a known symbol (Levenshtein distance ≤ 2,
 *      adaptive threshold), a "did you mean?" suggestion is appended.
 *
 * Note: this module is NOT a security layer. TiddlyWiki runs locally and
 * expressions are always authored by the user themselves.
 */

(function(){

"use strict";

var math = require("$:/plugins/nikorion/math/modules/math.js");

// ---------------------------------------------------------------------------
// _levenshtein — edit distance between two strings (classic DP, O(m×n))
// ---------------------------------------------------------------------------

function _levenshtein(a, b) {
	var m = a.length, n = b.length;
	var dp = [];
	for (var i = 0; i <= m; i++) {
		dp[i] = [i];
		for (var j = 1; j <= n; j++) {
			dp[i][j] = i === 0 ? j
				: j === 0 ? i
				: a[i - 1] === b[j - 1] ? dp[i - 1][j - 1]
				: 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
		}
	}
	return dp[m][n];
}

// ---------------------------------------------------------------------------
// _suggest — find the closest mathjs symbol to an unknown token.
//
// Adaptive distance threshold:
//   ≤ 2 chars  → no suggestion (too short, too ambiguous)
//   3 chars    → max distance 1, and the symbol must share the same first letter
//   4+ chars   → max distance 2
//
// Tie-breaking priority (lower = better):
//   1. Same first letter as the token
//   2. Symbol is an exact prefix of the token (e.g. "log" in "logg")
//   3. Smallest absolute length difference
//   4. Shortest symbol overall
//
// Returns the best matching symbol name, or null if nothing is close enough.
// ---------------------------------------------------------------------------

var _mathSymbols = null; // lazy-initialised cache of mathjs symbol names

function _suggest(token) {

	// Build the symbol list once from the live mathjs object.
	if (!_mathSymbols) {
		_mathSymbols = Object.keys(math).filter(function(k) {
			return /^[a-zA-Z]/.test(k);
		});
	}

	var len = token.length;
	var tok = token.toLowerCase();

	if (len <= 2) return null;

	var maxDist = len === 3 ? 1 : 2;

	var best     = null;
	var bestDist = Infinity;
	var bestTie  = Infinity;

	for (var i = 0; i < _mathSymbols.length; i++) {
		var sym  = _mathSymbols[i];
		var syml = sym.toLowerCase();

		// For 3-char tokens, skip symbols that don't share the first letter —
		// otherwise almost any 3-letter word would match something.
		if (len === 3 && syml[0] !== tok[0]) continue;

		var d = _levenshtein(tok, syml);
		if (d > maxDist) continue;

		// Tie-breaking score (lower = preferred)
		var sameStart = syml[0] === tok[0] ? 0 : 1;          // same first letter
		var isPrefix  = tok.indexOf(syml) === 0 ? 0 : 1;     // symbol is prefix of token
		var lenDiff   = Math.abs(sym.length - len);           // length proximity
		var symLen    = sym.length;                           // shorter symbol wins
		var tie       = sameStart * 1000000 + isPrefix * 10000 + lenDiff * 100 + symLen;

		if (d < bestDist || (d === bestDist && tie < bestTie)) {
			bestDist = d;
			bestTie  = tie;
			best     = sym;
		}
	}

	return best;
}

// ---------------------------------------------------------------------------
// _checkParens — verify parenthesis balance with exact position reporting
// ---------------------------------------------------------------------------

function _checkParens(expr) {

	var depth = 0;

	for (var i = 0; i < expr.length; i++) {
		if (expr[i] === "(") {
			depth++;
		} else if (expr[i] === ")") {
			depth--;
			if (depth < 0) {
				throw new Error(
					"Unexpected closing parenthesis at position " + (i + 1) +
					" — no matching opening parenthesis"
				);
			}
		}
	}

	if (depth > 0) {
		throw new Error(
			"Unclosed parenthesis: " + depth + " opening " +
			(depth === 1 ? "parenthesis is" : "parentheses are") +
			" never closed"
		);
	}
}

// ---------------------------------------------------------------------------
// sanitize (exported)
// ---------------------------------------------------------------------------

exports.sanitize = function(expr) {

	// 1. Empty expression
	if (expr.trim() === "") {
		throw new Error("Empty expression");
	}

	// 2. Unbalanced parentheses
	_checkParens(expr);

	// 3. Trailing binary operator
	var trailingOp = expr.match(/([+\-*/^%])\s*$/);
	if (trailingOp) {
		throw new Error(
			"Expression ends with operator \"" + trailingOp[1] +
			"\" — a value is expected after it"
		);
	}

	// 4. Leading binary operator (* / ^ cannot be unary; + and - can)
	var leadingOp = expr.match(/^\s*([*/^%])/);
	if (leadingOp) {
		throw new Error(
			"Expression starts with operator \"" + leadingOp[1] +
			"\" — a value is expected before it"
		);
	}

	// 5. Unknown identifiers
	var tokens = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];

	for (var i = 0; i < tokens.length; i++) {
		var token = tokens[i];

		// Accept known mathjs symbols (functions, constants…)
		if (typeof math[token] !== "undefined") continue;

		// Accept known mathjs units (kg, m, s, km/h…) — units are not properties
		// of the math object but are handled internally by the mathjs parser.
		if (math.Unit.isValuelessUnit(token)) continue;

		var suggestion = _suggest(token);
		var msg = "Unknown function or constant: \"" + token + "\"";
		if (suggestion) msg += " — did you mean \"" + suggestion + "\"?";

		throw new Error(msg);
	}

	return expr;
};

})();