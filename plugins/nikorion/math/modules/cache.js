/*\
title: $:/plugins/nikorion/math/modules/cache.js
type: application/javascript
module-type: library
\*/

/*
 * cache.js — LRU result cache
 *
 * Caches mathjs evaluation results to avoid recomputing the same expression
 * multiple times (e.g. during repeated TiddlyWiki refreshes).
 *
 * Exported:
 *   get(key)          → result | null
 *   set(key, value)
 *   key(tid, expr, locale, mode) → string
 *   clear(tid)
 *
 * Implementation:
 *   A plain Map is used as an ordered LRU cache.
 *   Least-recently-used eviction: on get(), the entry is deleted and
 *   re-inserted at the end (Map preserves insertion order). On set(),
 *   the oldest entry is removed when the cache reaches MAX_SIZE.
 *
 * Cache key format:
 *   "<tiddler title>::<input locale>::<scientific mode>::<normalised expression>"
 *   Including the tiddler title allows targeted invalidation when a tiddler
 *   is edited (see clear()).
 */

(function(){

"use strict";

var MAX_SIZE = 200;

// The Map acts as an ordered LRU store.
var _cache = new Map();

// ---------------------------------------------------------------------------
// get — retrieve a cached value and refresh its LRU position.
// Returns null on a cache miss.
// ---------------------------------------------------------------------------

exports.get = function(key) {

	if (!_cache.has(key)) return null;

	// Move to end (most recently used) by deleting and re-inserting.
	var value = _cache.get(key);
	_cache.delete(key);
	_cache.set(key, value);

	return value;
};

// ---------------------------------------------------------------------------
// set — store a new value, evicting the oldest entry if the cache is full.
// ---------------------------------------------------------------------------

exports.set = function(key, value) {

	if (_cache.size >= MAX_SIZE) {
		// Delete the first (= oldest / least recently used) entry.
		_cache.delete(_cache.keys().next().value);
	}

	_cache.set(key, value);
};

// ---------------------------------------------------------------------------
// key — build a cache key from evaluation context.
// ---------------------------------------------------------------------------

exports.key = function(tid, expr, locale, mode) {
	return tid + "::" + locale + "::" + mode + "::" + expr;
};

// ---------------------------------------------------------------------------
// clear — remove all cached entries belonging to a given tiddler.
// Called when a tiddler is modified, so stale results are not served.
// ---------------------------------------------------------------------------

exports.clear = function(tid) {

	var prefix = tid + "::";

	for (var k of _cache.keys()) {
		if (k.indexOf(prefix) === 0) {
			_cache.delete(k);
		}
	}
};

})();