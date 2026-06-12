/*\
title: $:/plugins/nikorion/math/modules/cache.js
type: application/javascript
module-type: library
\*/

/*
 * cache.js — LRU result cache 🗃️
 *
 * Caches mathjs evaluation results to avoid recomputing identical
 * expressions on every TiddlyWiki refresh cycle.
 *
 * Implementation: a plain Map used as an ordered LRU store.
 * Map preserves insertion order; on get() the entry is deleted and
 * re-inserted at the end (= most recently used).  On set(), the first
 * (= oldest / least-recently-used) entry is evicted when full.
 *
 * ── Why 500 entries? ─────────────────────────────────────────────────
 * Each cache entry holds a mathjs result object (a number, Unit, Matrix…)
 * which is lightweight (typically < 1 KB).  500 entries ≈ a few hundred KB
 * at most — negligible for a modern browser.  The cache is useful whenever
 * multiple <$calc> widgets share the same expression (e.g. in a table), or
 * when TiddlyWiki triggers many refresh cycles.  A wiki with hundreds of
 * <$calc> instances is realistic (a large financial or scientific notebook),
 * so 500 is a safe ceiling without meaningful memory cost. 🧠
 *
 * Cache key format:
 *   JSON array: ["<tiddler-title>", "<calcPrec>", "<scope-attr>", "<expr>"]
 *   JSON encoding avoids separator collisions with titles containing "::".
 *   The tiddler title enables targeted invalidation when a tiddler changes.
 *   calcPrec and the scope attribute are part of the key because they change
 *   the RAW result.  notation/precision are deliberately NOT included: the
 *   cached value is the raw (unformatted) result — formatting happens after
 *   retrieval, so two widgets differing only in display options share entries.
 *
 * Exported:
 *   get(key)                          → result | null
 *   set(key, value)
 *   key(tid, expr, calcPrec, scope)   → string
 *   clear(tid)
 */

(function () {
  "use strict";

  const MAX_SIZE = 500;
  const _cache   = new Map();

  /** Retrieve a cached value and refresh its LRU position. 🔄 */
  exports.get = function get(key) {
    if (!_cache.has(key)) return null;
    const value = _cache.get(key);
    _cache.delete(key);   // move to end (most-recently-used)
    _cache.set(key, value);
    return value;
  };

  /** Store a value, evicting the oldest entry if the cache is full. */
  exports.set = function set(key, value) {
    if (_cache.size >= MAX_SIZE) _cache.delete(_cache.keys().next().value);
    _cache.set(key, value);
  };

  /** Build a cache key from evaluation context. 🔑 */
  exports.key = function key(tid, expr, calcPrec, scopeAttr) {
    return JSON.stringify([tid, calcPrec, scopeAttr, expr]);
  };

  /** Remove all entries belonging to a given tiddler. 🧹 */
  exports.clear = function clear(tid) {
    // '["<tid>",' — same JSON escaping as key(), so titles containing
    // quotes or "::" cannot collide with another tiddler's prefix.
    const prefix = JSON.stringify([tid]).slice(0, -1) + ",";
    for (const k of _cache.keys()) {
      if (k.startsWith(prefix)) _cache.delete(k);
    }
  };

})();