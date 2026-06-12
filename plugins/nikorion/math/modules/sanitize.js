/*\
title: $:/plugins/nikorion/math/modules/sanitize.js
type: application/javascript
module-type: library
\*/

/*
 * sanitize.js — static expression validation 🛡️
 *
 * Runs a pre-evaluation pass to catch unknown identifiers before mathjs
 * sees the expression, producing a "did you mean?" suggestion when the
 * token is close to a known name.
 *
 * Structural errors (unbalanced parentheses, leading/trailing operators)
 * are intentionally left to mathjs — math.parse() / math.evaluate() already
 * detect them and throw precise messages that errors.rewriteError() reformats.
 *
 * Note: this is NOT a security layer — TiddlyWiki runs entirely in the
 * user's own browser; expressions are always authored by the user. 🏠
 *
 * Exported:
 *   sanitize(expr, math, varScope) → expr  (unchanged if valid, throws otherwise)
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
      if (len === 3 && syml[0] !== tok[0]) continue;

      const d = levenshtein(tok, syml);
      if (d > maxDist) continue;

      const tie =
        (syml[0] !== tok[0] ? 1_000_000 : 0) +
        (tok.indexOf(syml) !== 0 ? 10_000 : 0) +
        Math.abs(sym.length - len) * 100 +
        sym.length;

      if (d < bestDist || (d === bestDist && tie < bestTie)) {
        bestDist = d; bestTie = tie; best = sym;
      }
    }
    return best;
  }

  // ─────────────────────────────────────────────────────────────────────
  // sanitize (exported) ✅
  // ─────────────────────────────────────────────────────────────────────
  exports.sanitize = function sanitize(expr, math, varScope = {}) {
    // Strip scientific-notation literals so "e" in "5e9" is never treated
    // as an identifier token.
    const strippedForTokens = expr.replace(/\d+\.?\d*[eE][+\-]?\d+/g, "0");

    for (const token of (strippedForTokens.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [])) {
      if (typeof math[token] !== "undefined") continue;        // known mathjs symbol
      if (math.Unit?.isValuelessUnit(token))  continue;        // known mathjs unit
      if (token in varScope)                  continue;        // user-defined variable 👤
      const hint = suggest(token, math);
      throw new Error(
        `Unknown function or constant: "${token}"` +
        (hint ? ` — did you mean "${hint}"?` : "")
      );
    }

    return expr;
  };

})();