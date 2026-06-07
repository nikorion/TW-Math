/*\
title: $:/plugins/nikorion/math/modules/sanitize.js
type: application/javascript
module-type: library
\*/

/*
 * sanitize.js — static expression validation 🛡️
 *
 * Runs lightweight structural checks on a normalised expression BEFORE
 * passing it to mathjs, producing precise, user-friendly error messages
 * for common mistakes.
 *
 * Note: this is NOT a security layer — TiddlyWiki runs entirely in the
 * user's own browser; expressions are always authored by the user. 🏠
 *
 * Checks (in order):
 *   1. Empty expression
 *   2. Unbalanced parentheses — reports exact position on mismatch
 *   3. Trailing binary operator  e.g. "1 +"
 *   4. Leading binary operator   e.g. "* 2"  (unary +/- are allowed)
 *   5. Unknown identifiers — every alphabetic token must be a known mathjs
 *      symbol or unit.  A Levenshtein-based "did you mean?" suggestion is
 *      appended when the token is close to a known name.
 *
 * Exported:
 *   sanitize(expr, math) → expr  (unchanged if valid, throws otherwise)
 */

(function () {
  "use strict";

  // ── Levenshtein edit distance (O(m·n) DP) ────────────────────────────
  // Used to find the closest known symbol to an unrecognised identifier. 📏
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  // Lazy-initialised cache of mathjs symbol names (built once per session). 🗄️
  let mathSymbols = null;

  /**
   * Find the closest mathjs symbol to an unknown token.
   *
   * Adaptive distance threshold:
   *   ≤ 2 chars  → no suggestion (too short, too ambiguous)
   *   3 chars    → max distance 1, must share the same first letter
   *   4+ chars   → max distance 2
   *
   * Tie-breaking (lower score = preferred):
   *   1. Same first letter as the token
   *   2. Token is a prefix of the symbol ("log" in "logg") 🔍
   *   3. Smallest length difference
   *   4. Shortest symbol
   */
  function suggest(token, math) {
    if (!mathSymbols) {
      mathSymbols = Object.keys(math).filter(k => /^[a-zA-Z]/.test(k));
    }

    const len = token.length;
    const tok = token.toLowerCase();
    if (len <= 2) return null;

    const maxDist = len === 3 ? 1 : 2;
    let best = null, bestDist = Infinity, bestTie = Infinity;

    for (const sym of mathSymbols) {
      const syml = sym.toLowerCase();
      if (len === 3 && syml[0] !== tok[0]) continue; // first-letter guard for short tokens

      const d = levenshtein(tok, syml);
      if (d > maxDist) continue;

      const tie =
        (syml[0] !== tok[0] ? 1_000_000 : 0) +
        (tok.indexOf(syml) !== 0 ? 10_000 : 0) +  // prefix bonus
        Math.abs(sym.length - len) * 100 +
        sym.length;

      if (d < bestDist || (d === bestDist && tie < bestTie)) {
        bestDist = d; bestTie = tie; best = sym;
      }
    }
    return best;
  }

  // ── Parenthesis balance check ─────────────────────────────────────────
  function checkParens(expr) {
    let depth = 0;
    for (let i = 0; i < expr.length; i++) {
      if      (expr[i] === "(") depth++;
      else if (expr[i] === ")") {
        if (--depth < 0) throw new Error(
          `Unexpected closing parenthesis at position ${i + 1} — no matching opening parenthesis`
        );
      }
    }
    if (depth > 0) throw new Error(
      `Unclosed parenthesis: ${depth} opening ${depth === 1 ? "parenthesis is" : "parentheses are"} never closed`
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // sanitize (exported) ✅
  // ─────────────────────────────────────────────────────────────────────
  exports.sanitize = function sanitize(expr, math, varScope = {}) {
    if (!expr.trim()) throw new Error("Empty expression");

    checkParens(expr);

    // Trailing binary operator
    const trailing = expr.match(/([+\-*/^%])\s*$/);
    if (trailing) throw new Error(
      `Expression ends with operator "${trailing[1]}" — a value is expected after it`
    );

    // Leading binary operator (* / ^ are never unary; + and - can be)
    const leading = expr.match(/^\s*([*/^%])/);
    if (leading) throw new Error(
      `Expression starts with operator "${leading[1]}" — a value is expected before it`
    );

    // Unknown identifiers 🔍
    for (const token of (expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [])) {
      if (typeof math[token] !== "undefined") continue;          // known mathjs symbol
      if (math.Unit.isValuelessUnit(token))   continue;          // known mathjs unit
      if (token in varScope)                  continue;          // user-defined variable 👤
      const hint = suggest(token, math);
      throw new Error(
        `Unknown function or constant: "${token}"` +
        (hint ? ` — did you mean "${hint}"?` : "")
      );
    }

    return expr;
  };

})();
