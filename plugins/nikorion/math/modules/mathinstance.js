/*\
title: $:/plugins/nikorion/math/modules/mathinstance.js
type: application/javascript
module-type: library
\*/

/*
 * mathinstance.js — mathjs instance factory & cache ⚙️
 *
 * Provides pre-built mathjs instances for each precision mode.
 * Instances are created once on first use and cached for the lifetime
 * of the page. 🗃️
 *
 * ── Precision modes ───────────────────────────────────────────────────
 *
 *   "float"  (default)
 *     Native IEEE 754 float64.  ~15–16 significant digits.  Fast.
 *
 *   "64" | "128" | "256"
 *     BigNumber with the given number of significant digits.
 *     ⚠️  sin/cos/tan and their inverses are limited to precision ≤ 509
 *     by an internal decimal.js ceiling.  256 is the highest safe value.
 *
 * ── Note on unit support ──────────────────────────────────────────────
 * This mathjs bundle does not expose allWithoutUnit — all instances
 * include the full unit subsystem.  Unit-free widgets simply avoid unit
 * syntax in their expressions.
 *
 * ── API ───────────────────────────────────────────────────────────────
 *   getInstance(mode)  → mathjs instance
 *   VALID_PRECISIONS   → ["float", "64", "128", "256"]
 *   DEFAULT_PRECISION  → "float"
 */

(function () {
  "use strict";

  const math = require("$:/plugins/nikorion/math/modules/math.min.js");

  const VALID_PRECISIONS  = ["float", "64", "128", "256"];
  const DEFAULT_PRECISION = "float";

  const _cache = new Map();

  exports.getInstance = function getInstance(mode) {
    const m = VALID_PRECISIONS.includes(mode) ? mode : DEFAULT_PRECISION;

    if (!_cache.has(m)) {
      const config = m === "float"
        ? { number: "number" }
        : { number: "BigNumber", precision: parseInt(m, 10) };
      _cache.set(m, math.create(config));
    }

    return _cache.get(m);
  };

  exports.VALID_PRECISIONS  = VALID_PRECISIONS;
  exports.DEFAULT_PRECISION = DEFAULT_PRECISION;

})();