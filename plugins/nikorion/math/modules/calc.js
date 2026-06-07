/*\
title: $:/plugins/nikorion/math/modules/calc.js
type: application/javascript
module-type: widget
\*/

(function(){

"use strict";

var Widget    = require("$:/core/modules/widgets/widget.js").widget;
var math      = require("$:/plugins/nikorion/math/modules/math.js");
var locale    = require("$:/plugins/nikorion/math/modules/locale.js");
var normalize = require("$:/plugins/nikorion/math/modules/normalize.js");
var sanitize  = require("$:/plugins/nikorion/math/modules/sanitize.js");
var format    = require("$:/plugins/nikorion/math/modules/format.js");
var cache     = require("$:/plugins/nikorion/math/modules/cache.js");

// ---------------------------------------------------------------------------

function CalcWidget(node, options) {
	this.initialise(node, options);
	this._timer = null;
	this._node = null;
}

CalcWidget.prototype = new Widget();

// ---------------------------------------------------------------------------

CalcWidget.prototype.render = function(parent, nextSibling) {

	this.parentDomNode = parent;
	this.computeAttributes();
	this.execute();

	var tid        = this.getVariable("currentTiddler");
	var inAttr     = this.getAttribute("in", "auto");
	var outAttr    = this.getAttribute("out", "en-US");
	var scientific = this.getAttribute("scientific", "auto");

	this.expression = this.document.createElement("div");
	this.renderChildren(this.expression);

	var expr = this.expression.textContent.trim();

	if (!this._node) {
		this._node = this.document.createElement("div");
		parent.insertBefore(this._node, nextSibling);
		this.domNodes.push(this._node);
	}

	var self = this;

	clearTimeout(this._timer);

	this._node.textContent = "…";

	this._timer = setTimeout(function() {

		var normalized;
		var errors = [];

		try {

			var inLocale = inAttr === "auto"
				? locale.detect(expr)
				: inAttr;

			normalized = normalize.normalize(expr, inLocale);

			errors = sanitize.sanitize(normalized) || [];

			// ------------------------------------------------------------
			// SUCCESS MODE → ONLY PLAIN TEXT
			// ------------------------------------------------------------
			if (errors.length === 0) {

				var key = cache.key(tid, normalized, inLocale, scientific);
				var result = cache.get(key);

				if (result === null) {
					result = math.evaluate(normalized);
					cache.set(key, result);
				}

				self._node.textContent =
					format.format(result, outAttr, { scientific: scientific });

				return;
			}

		} catch (e) {

			errors = [{
				code: "E000",
				message: e.message,
				start: 0,
				end: expr.length,
				severity: 3
			}];
		}

		// ------------------------------------------------------------
		// ERROR MODE → ALWAYS RICH RENDER
		// ------------------------------------------------------------
		self._node.innerHTML = renderOverlap(expr, errors);

	}, 150);
};

// ---------------------------------------------------------------------------
// OVERLAP SAFE RENDER (VSCode STYLE)
// ---------------------------------------------------------------------------

function renderOverlap(expr, errors) {

	var len = expr.length;

	var map = [];

	for (var i = 0; i < len; i++) {
		map[i] = {
			char: expr[i],
			error: null,
			severity: 0
		};
	}

	for (var e = 0; e < errors.length; e++) {

		var err = errors[e];

		var start = err.start;
		var end   = err.end;

		if (typeof start !== "number") continue;
		if (typeof end !== "number") end = start + 1;

		for (var i = start; i < end && i < len; i++) {

			var sev = err.severity || 1;

			if (sev > map[i].severity) {
				map[i].severity = sev;
				map[i].error = err;
			}
		}
	}

	var html = '<div class="calc-error-block">';

	var i = 0;

	while (i < len) {

		var cell = map[i];

		if (!cell.error) {
			html += escape(cell.char);
			i++;
			continue;
		}

		var err = cell.error;
		var j = i;

		while (j < len && map[j].error === err) {
			j++;
		}

		var msg = err.message || "Error";

		html += '<span class="calc-error calc-sev-' + (cell.severity || 1) + '" title="' + escape(msg) + '">';

		for (var k = i; k < j; k++) {
			html += escape(map[k].char);
		}

		html += '</span>';

		i = j;
	}

	html += '</div>';

	return html;
}

// ---------------------------------------------------------------------------
// ESCAPE
// ---------------------------------------------------------------------------

function escape(s) {
	return (s || "").replace(/[&<>"']/g, function(c) {
		return ({
			'&':'&amp;',
			'<':'&lt;',
			'>':'&gt;',
			'"':'&quot;',
			"'":'&#39;'
		})[c];
	});
}

exports.calc = CalcWidget;

})();