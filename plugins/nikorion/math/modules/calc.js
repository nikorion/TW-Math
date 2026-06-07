/*\
title: $:/plugins/nikorion/math/modules/calc.js
type: application/javascript
module-type: widget
\*/

/*
 * calc.js — <$calc> widget
 *
 * Evaluates a math expression (provided as widget body) and renders the
 * result as plain text or as a KaTeX formula.
 *
 * Attributes:
 *   in         {string}  Input locale: "auto" (default), "fr-FR", "en-US"
 *   out        {string}  Output locale: "en-US" (default), "fr-FR"
 *   scientific {string}  Scientific notation: "auto" (default), "always", "never"
 *   silence    {string}  "yes" → render nothing on error instead of an error message
 *   render     {string}  "text" (default) — plain text output
 *                        "katex"         — inline KaTeX formula
 *                        "katex-display" — display (block, centred) KaTeX formula
 *
 * Examples:
 *   <$calc out="fr-FR">1234.5 * 2</$calc>           →  2 469
 *   <$calc render="katex">sqrt(2)</$calc>            →  √2  (rendered by KaTeX)
 *   <$calc render="katex-display">pi * r^2</$calc>   →  π·r² centred on its own line
 *
 * Error debouncing:
 *   Successful results are shown immediately.
 *   Error messages are delayed by ERROR_DELAY ms so transient states while
 *   the user is still typing do not flash error text on screen.
 *   If the expression becomes valid before the delay elapses the pending
 *   error is cancelled and the result is shown right away.
 *
 * KaTeX integration:
 *   When render="katex" or "katex-display", the numeric result is passed as
 *   the `text` attribute of a $katex child widget, which is created
 *   programmatically via makeChildWidget(). This requires the
 *   tiddlywiki/katex plugin to be installed. If KaTeX is unavailable the
 *   widget silently falls back to plain text output.
 */

(function(){

"use strict";

var Widget    = require("$:/core/modules/widgets/widget.js").widget;
var math      = require("$:/plugins/nikorion/math/modules/math.js");
var locale    = require("$:/plugins/nikorion/math/modules/locale.js");
var normalize = require("$:/plugins/nikorion/math/modules/normalize.js");
var sanitize  = require("$:/plugins/nikorion/math/modules/sanitize.js");
var format    = require("$:/plugins/nikorion/math/modules/format.js");
var cache     = require("$:/plugins/nikorion/math/modules/cache.js");

// Delay (ms) before an error message is rendered after a failed evaluation.
var ERROR_DELAY = 200;

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

function CalcWidget(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
	this._errorTimer  = null; // setTimeout handle for pending error display
	this._katexWidget = null; // child $katex widget instance (when render=katex)
}

CalcWidget.prototype = new Widget();

// ---------------------------------------------------------------------------
// render — called once by TiddlyWiki when the widget is first inserted
// ---------------------------------------------------------------------------

CalcWidget.prototype.render = function(parent, nextSibling) {

	this.parentDomNode  = parent;
	this.nextSibling    = nextSibling;
	this.computeAttributes();
	this.execute();

	var tid        = this.getVariable("currentTiddler");
	var inAttr     = this.getAttribute("in",         "auto");
	var outAttr    = this.getAttribute("out",        "en-US");
	var scientific = this.getAttribute("scientific", "auto");
	var renderMode = this.getAttribute("render",     "text");
	this.silence   = this.getAttribute("silence",    "no") === "yes";

	// Render children into a detached div to collect the raw expression text.
	this.expression = this.document.createElement("div");
	this.renderChildren(this.expression);

	var expr = this.expression.textContent.trim();

	// Lazy evaluation: skip re-render if nothing changed.
	// Guard with domNodes.length so the very first render is never skipped.
	if (this.domNodes.length > 0 && this.lastExpr === expr) {
		return false;
	}
	this.lastExpr = expr;

	this._renderResult(expr, tid, inAttr, outAttr, scientific, renderMode, parent, nextSibling);
};

// ---------------------------------------------------------------------------
// _renderResult — evaluate and display, with error debouncing
// ---------------------------------------------------------------------------

CalcWidget.prototype._renderResult = function(expr, tid, inAttr, outAttr, scientific, renderMode, parent, nextSibling) {

	var self = this;
	var outcome = this._evaluate(expr, tid, inAttr, outAttr, scientific);

	if (outcome.ok) {

		// Success: cancel any pending error, display result immediately.
		this._cancelErrorTimer();
		this._display(outcome.text, renderMode, parent, nextSibling);

	} else {

		// Error: cancel the stale pending error (expression has changed),
		// schedule the new one after ERROR_DELAY ms.
		this._cancelErrorTimer();

		if (!this.silence) {
			this._errorTimer = setTimeout(function() {
				self._errorTimer = null;
				// Error messages are always plain text, regardless of render mode.
				self._displayText(outcome.text, parent, nextSibling);
			}, ERROR_DELAY);
		}
		// While waiting, leave the previously displayed content untouched so a
		// valid result already on screen stays visible during typing.
	}
};

// ---------------------------------------------------------------------------
// _display — route to the correct output renderer
// ---------------------------------------------------------------------------

CalcWidget.prototype._display = function(text, renderMode, parent, nextSibling) {

	if (renderMode === "katex" || renderMode === "katex-display") {
		this._displayKatex(text, renderMode === "katex-display", parent, nextSibling);
	} else {
		this._displayText(text, parent, nextSibling);
	}
};

// ---------------------------------------------------------------------------
// _displayText — insert a plain text node into the DOM
// ---------------------------------------------------------------------------

CalcWidget.prototype._displayText = function(text, parent, nextSibling) {

	this._clearOutput();
	var node = this.document.createTextNode(text);
	parent.insertBefore(node, nextSibling);
	this.domNodes.push(node);
};

// ---------------------------------------------------------------------------
// _displayKatex — render the result through a $katex child widget
//
// Creates a synthetic $katex parse tree node and instantiates it as a proper
// TiddlyWiki child widget so that KaTeX handles all rendering and refresh
// logic. Falls back to plain text if the $katex widget type is unavailable
// (i.e. the KaTeX plugin is not installed).
// ---------------------------------------------------------------------------

CalcWidget.prototype._displayKatex = function(text, displayMode, parent, nextSibling) {

	this._clearOutput();

	// Build a synthetic parse tree node equivalent to:
	//   <$katex text="..." displayMode="..." />
	var katexNode = {
		type: "katex",
		attributes: {
			text: { type: "string", value: text }
		},
		children: []
	};

	if (displayMode) {
		katexNode.attributes.displayMode = { type: "string", value: "true" };
	}

	// makeChildWidget creates a fully-wired widget instance from a parse tree
	// node, inheriting this widget's variable scope and document context.
	var katexWidget = this.makeChildWidget(katexNode);

	if (!katexWidget || katexWidget.type === "widget") {
		// The $katex widget type is unknown — KaTeX plugin is not installed.
		// Fall back to plain text so the result is still visible.
		this._displayText(text, parent, nextSibling);
		return;
	}

	katexWidget.render(parent, nextSibling);

	// Keep a reference so refresh() can propagate TiddlyWiki change events.
	this._katexWidget = katexWidget;

	// Collect the DOM nodes produced by $katex for removeChildDomNodes().
	if (katexWidget.domNodes) {
		for (var i = 0; i < katexWidget.domNodes.length; i++) {
			this.domNodes.push(katexWidget.domNodes[i]);
		}
	}
};

// ---------------------------------------------------------------------------
// _clearOutput — remove previously rendered DOM nodes and katex widget
// ---------------------------------------------------------------------------

CalcWidget.prototype._clearOutput = function() {
	this.removeChildDomNodes();
	this._katexWidget = null;
};

// ---------------------------------------------------------------------------
// _cancelErrorTimer — cancel a pending debounced error display
// ---------------------------------------------------------------------------

CalcWidget.prototype._cancelErrorTimer = function() {

	if (this._errorTimer !== null) {
		clearTimeout(this._errorTimer);
		this._errorTimer = null;
	}
};

// ---------------------------------------------------------------------------
// refresh — called by TiddlyWiki whenever tiddlers change
// ---------------------------------------------------------------------------

CalcWidget.prototype.refresh = function(changedTiddlers) {

	var tid = this.getVariable("currentTiddler");

	if (changedTiddlers[tid]) {
		cache.clear(tid);
	}

	var changedAttributes = this.computeAttributes();
	if (changedAttributes["in"] || changedAttributes["out"] ||
	    changedAttributes["scientific"] || changedAttributes["render"]) {
		this.refreshSelf();
		return true;
	}

	// Propagate refresh to the $katex child widget if present.
	if (this._katexWidget && this._katexWidget.refresh(changedTiddlers)) {
		return true;
	}

	if (this.refreshChildren(changedTiddlers)) {
		this.refreshSelf();
		return true;
	}

	return false;
};

// ---------------------------------------------------------------------------
// _evaluate — full pipeline: detect → normalize → sanitize → evaluate → format
//
// Returns { ok: true,  text: "<formatted result>" }
//      or { ok: false, text: "Error: <message>"   }
// ---------------------------------------------------------------------------

CalcWidget.prototype._evaluate = function(expr, tid, inAttr, outAttr, scientific) {

	try {

		var inLocale = inAttr === "auto" ? locale.detect(expr) : inAttr;

		if (inLocale === "MIXED") {
			throw new Error(
				"Mixed notation detected: the expression contains both " +
				"FR indicators (comma decimal, \u00D7 \u2026) and EN indicators " +
				"(dot decimal, e notation \u2026). Use one notation consistently."
			);
		}

		var normalized = normalize.normalize(expr, inLocale);
		sanitize.sanitize(normalized);

		var key    = cache.key(tid, normalized, inLocale, scientific);
		var result = cache.get(key);

		if (result === null) {
			result = math.evaluate(normalized);
			var resultError = this._checkResult(result);
			if (resultError) throw new Error(resultError);
			cache.set(key, result);
		}

		return { ok: true, text: format.format(result, outAttr, { scientific: scientific }) };

	} catch (e) {
		return { ok: false, text: "Error: " + this._rewriteError(e.message, expr) };
	}
};

// ---------------------------------------------------------------------------
// _checkResult — detect invalid numeric results that mathjs does not throw on
// ---------------------------------------------------------------------------

CalcWidget.prototype._checkResult = function(result) {

	if (typeof result === "number") {
		if (result === Infinity)  return "Division by zero (result is +\u221E)";
		if (result === -Infinity) return "Result is \u2212\u221E (division by a negative value approaching zero)";
		if (isNaN(result))        return "Result is undefined \u2014 likely 0/0 or Infinity\u2212Infinity";
	}

	if (result && typeof result === "object" && result.isComplex && result.im !== 0) {
		return (
			"Result is a complex number (" + result.re + " + " + result.im + "i)" +
			" \u2014 check for sqrt() or log() of a negative value"
		);
	}

	return null;
};

// ---------------------------------------------------------------------------
// _rewriteError — turn cryptic mathjs error messages into plain English
// ---------------------------------------------------------------------------

CalcWidget.prototype._rewriteError = function(msg, originalExpr) {

	if (!msg) return "Unknown error";

	var m;

	m = msg.match(/[Uu]ndefined symbol\s+(\S+)/);
	if (m) return "Unknown function or constant: \"" + m[1] + "\"";

	m = msg.match(/[Tt]oo few arguments.*?(\w+)\s*\(expected:\s*(\d+)/);
	if (m) return m[1] + "() requires " + m[2] + " argument" + (m[2] === "1" ? "" : "s") + " but got fewer";

	m = msg.match(/[Tt]oo many arguments.*?(\w+)\s*\(expected:\s*(\d+),\s*actual:\s*(\d+)/);
	if (m) return m[1] + "() takes " + m[2] + " argument" + (m[2] === "1" ? "" : "s") + " but " + m[3] + " were given";

	m = msg.match(/[Uu]nexpected type.*?function\s+(\w+).*?expected:\s*(\w+),\s*actual:\s*(\w+)/);
	if (m) return m[1] + "() expects a " + m[2] + " but received a " + m[3];

	m = msg.match(/char(?:acter)?\s+(\d+)/i);
	if (m) {
		var pos = parseInt(m[1], 10);
		var ch  = originalExpr && originalExpr[pos - 1];
		return "Syntax error at position " + pos + (ch ? " (near \"" + ch + "\")" : "");
	}

	if (/unexpected end/i.test(msg)) {
		return "Unexpected end of expression \u2014 is the expression complete?";
	}

	m = msg.match(/[Uu]nexpected token\s+['"]?([^'"\s,]+)/);
	if (m) return "Unexpected \"" + m[1] + "\" in expression";

	return msg.replace(/\s*\(char \d+\)/g, "").replace(/\s*at index \d+/g, "").trim();
};

exports.calc = CalcWidget;

})();