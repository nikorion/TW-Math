/*\
title: $:/plugins/nikorion/math/modules/calc.js
type: application/javascript
module-type: widget
\*/

(function(){

"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;
var math = require("$:/plugins/nikorion/math/modules/math.js");

var locale = require("$:/plugins/nikorion/math/modules/locale.js");
var normalize = require("$:/plugins/nikorion/math/modules/normalize.js");
var sanitize = require("$:/plugins/nikorion/math/modules/sanitize.js");
var format = require("$:/plugins/nikorion/math/modules/format.js");
var cache = require("$:/plugins/nikorion/math/modules/cache.js");

function CalcWidget(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
}

CalcWidget.prototype = new Widget();

CalcWidget.prototype.render = function(parent, nextSibling) {

	this.parentDomNode = parent;
	this.computeAttributes();
	this.execute();

	var tid = this.getVariable("currentTiddler");

	var inAttr = this.getAttribute("in", "auto");
	var outAttr = this.getAttribute("out", "en-US");
	var scientific = this.getAttribute("scientific", "auto");

	this.expression = this.document.createElement("div");
	this.renderChildren(this.expression);

	var expr = this.expression.textContent.trim();
	var text;

	// lazy eval
	if (this.lastExpr === expr) {
		return;
	}
	this.lastExpr = expr;

	try {

		var inLocale = inAttr === "auto"
			? locale.detect(expr)
			: inAttr;

		if (inLocale === "MIXED") {
			throw new Error("Mix FR/EN détecté");
		}

		var normalized = normalize.normalize(expr, inLocale);

		sanitize.sanitize(normalized);

		var key = cache.key(tid, normalized, inLocale, scientific);

		var result = cache.get(key);

		if (!result) {
			result = math.evaluate(normalized);
			cache.set(key, result);
		}

		text = format.format(result, outAttr, {
			scientific: scientific
		});

	} catch (e) {
		text = this.silence ? "" : "Erreur: " + e.message;
	}

	var node = this.document.createTextNode(text);
	parent.insertBefore(node, nextSibling);
	this.domNodes.push(node);
};

CalcWidget.prototype.refresh = function(changedTiddlers) {

	var tid = this.getVariable("currentTiddler");

	if (changedTiddlers[tid]) {
		cache.clear(tid);
	}

	if (this.refreshChildren(changedTiddlers)) {
		this.refreshSelf();
		return true;
	}

	return false;
};

exports.calc = CalcWidget;

})();