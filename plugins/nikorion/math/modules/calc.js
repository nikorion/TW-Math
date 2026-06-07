/*\
title: $:/plugins/nikorion/math/modules/calc.js
type: application/javascript
module-type: widget
\*/

/*
 * calc.js — <$calc> widget 🧮
 *
 * Evaluates a math expression (widget body) via mathjs and renders the
 * result as plain text or as a KaTeX formula.
 *
 * ── Attributes ───────────────────────────────────────────────────────
 *
 *   out        {string}   Output locale for number formatting.
 *                         "en-US" (default) | "fr-FR" | any BCP-47 tag.
 *
 *   scientific {string}   Scientific notation mode.
 *                         "auto" (default) | "always" | "never"
 *
 *   render     {string}   Output renderer.
 *                         "text"          (default) plain text node
 *                         "katex"         inline KaTeX formula
 *                         "katex-display" display (centred block) KaTeX
 *
 *   silence    {string}   "yes" → render nothing on error instead of
 *                         showing an error message.  "no" (default).
 *
 *   data       {string}   Title of a "data tiddler" whose text defines
 *                         named variables (one per line, "name: expr").
 *                         Those variables are injected into mathjs scope
 *                         before evaluating the widget expression.
 *
 * ── Error debouncing ─────────────────────────────────────────────────
 * Successful results are shown immediately.
 * Error messages are delayed by ERROR_DELAY ms so transient states
 * while the user is still typing do not flash red on screen. ⏱️
 * If the expression becomes valid before the delay elapses the pending
 * error is cancelled and the result is shown right away.
 *
 * ── KaTeX integration ────────────────────────────────────────────────
 * When render="katex" or "katex-display", the formatted result is passed
 * as the `text` attribute of a $katex child widget created via
 * makeChildWidget().  This requires the tiddlywiki/katex plugin.
 * If KaTeX is unavailable the widget falls back to plain text silently. 🔄
 *
 * ── Variable scope (data attribute) ──────────────────────────────────
 * The data tiddler is re-read on every refresh so live edits to
 * variables are reflected immediately.  Parse errors in the data tiddler
 * are surfaced as widget errors (subject to the same ERROR_DELAY). ⚠️
 */

(function () {
  "use strict";

  const Widget    = require("$:/core/modules/widgets/widget.js").widget;
  const math      = require("$:/plugins/nikorion/math/modules/math.js");
  const normalize = require("$:/plugins/nikorion/math/modules/normalize.js");
  const sanitize  = require("$:/plugins/nikorion/math/modules/sanitize.js");
  const format    = require("$:/plugins/nikorion/math/modules/format.js");
  const cache     = require("$:/plugins/nikorion/math/modules/cache.js");
  const scope     = require("$:/plugins/nikorion/math/modules/scope.js");

  const ERROR_DELAY = 100; // ms — see module header

  // ─────────────────────────────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────────────────────────────
  function CalcWidget(parseTreeNode, options) {
    this.initialise(parseTreeNode, options);
    this._errorTimer  = null; // pending error setTimeout handle ⏳
    this._katexWidget = null; // live $katex child widget reference
  }

  CalcWidget.prototype = new Widget();

  // ─────────────────────────────────────────────────────────────────────
  // render — called once when the widget is first inserted into the DOM
  // ─────────────────────────────────────────────────────────────────────
  CalcWidget.prototype.render = function (parent, nextSibling) {
    this.parentDomNode = parent;
    this.nextSibling   = nextSibling;
    this.computeAttributes();
    this.execute();

    // Collect the raw expression text from child nodes.
    this.expression = this.document.createElement("div");
    this.renderChildren(this.expression);

    const expr = this.expression.textContent.trim();

    // Lazy evaluation guard — skip identical re-renders after the first. 🚦
    if (this.domNodes.length > 0 && this.lastExpr === expr) return false;
    this.lastExpr = expr;

    this._renderResult(expr, parent, nextSibling);
  };

  // ─────────────────────────────────────────────────────────────────────
  // _renderResult — run the pipeline then display with error debouncing
  // ─────────────────────────────────────────────────────────────────────
  CalcWidget.prototype._renderResult = function (expr, parent, nextSibling) {
    const outcome = this._evaluate(expr);

    if (outcome.ok) {
      this._cancelErrorTimer();
      this._display(outcome.text, parent, nextSibling);
      return;
    }

    // On error: cancel stale pending error (expr changed), schedule new one. ⏱️
    this._cancelErrorTimer();
    if (this.getAttribute("silence", "no") !== "yes") {
      this._errorTimer = setTimeout(() => {
        this._errorTimer = null;
        this._displayText(outcome.text, parent, nextSibling); // errors are always plain text
      }, ERROR_DELAY);
    }
    // Previously displayed content stays visible while waiting.
  };

  // ─────────────────────────────────────────────────────────────────────
  // _display — route to the appropriate renderer
  // ─────────────────────────────────────────────────────────────────────
  CalcWidget.prototype._display = function (text, parent, nextSibling) {
    const renderMode = this.getAttribute("render", "text");
    if (renderMode === "katex" || renderMode === "katex-display") {
      this._displayKatex(text, renderMode === "katex-display", parent, nextSibling);
    } else {
      this._displayText(text, parent, nextSibling);
    }
  };

  // ── Plain text output ─────────────────────────────────────────────────
  CalcWidget.prototype._displayText = function (text, parent, nextSibling) {
    this._clearOutput();
    const node = this.document.createTextNode(text);
    parent.insertBefore(node, nextSibling);
    this.domNodes.push(node);
  };

  // ── KaTeX output ──────────────────────────────────────────────────────
  // Creates a synthetic $katex parse-tree node and instantiates it as a
  // proper TiddlyWiki child widget via makeChildWidget() — identical to
  // writing <$katex text="..." /> in wikitext but driven programmatically.
  CalcWidget.prototype._displayKatex = function (text, displayMode, parent, nextSibling) {
    this._clearOutput();

    const katexNode = {
      type: "katex",
      attributes: {
        text: { type: "string", value: text },
        ...(displayMode && { displayMode: { type: "string", value: "true" } }),
      },
      children: [],
    };

    const katexWidget = this.makeChildWidget(katexNode);

    // Fallback: if $katex widget type is unknown (plugin not installed). 🔄
    if (!katexWidget || katexWidget.type === "widget") {
      this._displayText(text, parent, nextSibling);
      return;
    }

    katexWidget.render(parent, nextSibling);
    this._katexWidget = katexWidget;

    // Collect DOM nodes produced by $katex so removeChildDomNodes() works.
    for (const node of (katexWidget.domNodes ?? [])) this.domNodes.push(node);
  };

  // ── Clear previously rendered output ──────────────────────────────────
  CalcWidget.prototype._clearOutput = function () {
    this.removeChildDomNodes();
    this._katexWidget = null;
  };

  // ── Cancel a pending debounced error ──────────────────────────────────
  CalcWidget.prototype._cancelErrorTimer = function () {
    if (this._errorTimer !== null) {
      clearTimeout(this._errorTimer);
      this._errorTimer = null;
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // refresh — called by TiddlyWiki on every tiddler change
  // ─────────────────────────────────────────────────────────────────────
  CalcWidget.prototype.refresh = function (changedTiddlers) {
    const tid        = this.getVariable("currentTiddler");
    const dataTitle  = this.getAttribute("data", "");

    // Invalidate cache when the host tiddler or the data tiddler changes. 🗑️
    if (changedTiddlers[tid])        cache.clear(tid);
    if (dataTitle && changedTiddlers[dataTitle]) cache.clear(tid);

    const changed = this.computeAttributes();
    if (changed["out"] || changed["scientific"] || changed["render"] || changed["data"]) {
      this.refreshSelf();
      return true;
    }

    // Propagate refresh to the live $katex child widget if present.
    if (this._katexWidget?.refresh(changedTiddlers)) return true;

    if (this.refreshChildren(changedTiddlers)) {
      this.refreshSelf();
      return true;
    }

    return false;
  };

  // ─────────────────────────────────────────────────────────────────────
  // _evaluate — full pipeline 🔬
  //   normalize → sanitize → scope → cache → evaluate → check → format
  //
  // Returns { ok: true,  text: "<formatted result>" }
  //      or { ok: false, text: "Error: <message>"   }
  // ─────────────────────────────────────────────────────────────────────
  CalcWidget.prototype._evaluate = function (expr) {
    const tid        = this.getVariable("currentTiddler");
    const outAttr    = this.getAttribute("out",        "en-US");
    const scientific = this.getAttribute("scientific", "auto");
    const dataTitle  = this.getAttribute("data",       "");

    try {
      const normalized = normalize.normalize(expr);

      // Build variable scope from the data tiddler (empty object if none). 📦
      const varScope = scope.buildScope(dataTitle, this.wiki, math);

      // Unknown identifiers that are not in scope are flagged here. 🔍
      // We pass the scope so that user-defined variables are accepted.
      sanitize.sanitize(normalized, math, varScope);

      const key    = cache.key(tid, normalized, scientific);
      let   result = cache.get(key);

      if (result === null) {
        result = math.evaluate(normalized, varScope);
        const err = this._checkResult(result);
        if (err) throw new Error(err);
        cache.set(key, result);
      }

      return { ok: true, text: format.format(result, outAttr, { scientific }) };

    } catch (e) {
      return { ok: false, text: `Error: ${this._rewriteError(e.message, expr)}` };
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // _checkResult — detect invalid numeric results mathjs doesn't throw on
  // ─────────────────────────────────────────────────────────────────────
  CalcWidget.prototype._checkResult = function (result) {
    if (typeof result === "number") {
      if (result ===  Infinity) return "Division by zero (result is +\u221E)";
      if (result === -Infinity) return "Result is \u2212\u221E (division by a negative value approaching zero)";
      if (isNaN(result))        return "Result is undefined \u2014 likely 0\u20440 or \u221E\u2212\u221E";
    }
    // mathjs returns a Complex object when the result has a non-zero imaginary part
    // e.g. sqrt(-1) → 0 + 1i,  log(-1) → 0 + πi
    if (result?.isComplex && result.im !== 0) {
      return `Result is a complex number (${result.re} + ${result.im}i) \u2014 check for sqrt() or log() of a negative value`;
    }
    return null;
  };

  // ─────────────────────────────────────────────────────────────────────
  // _rewriteError — turn cryptic mathjs messages into plain English 💬
  // ─────────────────────────────────────────────────────────────────────
  CalcWidget.prototype._rewriteError = function (msg, originalExpr) {
    if (!msg) return "Unknown error";

    let m;

    if ((m = msg.match(/[Uu]ndefined symbol\s+(\S+)/)))
      return `Unknown function or constant: "${m[1]}"`;

    if ((m = msg.match(/[Tt]oo few arguments.*?(\w+)\s*\(expected:\s*(\d+)/)))
      return `${m[1]}() requires ${m[2]} argument${m[2] === "1" ? "" : "s"} but got fewer`;

    if ((m = msg.match(/[Tt]oo many arguments.*?(\w+)\s*\(expected:\s*(\d+),\s*actual:\s*(\d+)/)))
      return `${m[1]}() takes ${m[2]} argument${m[2] === "1" ? "" : "s"} but ${m[3]} were given`;

    if ((m = msg.match(/[Uu]nexpected type.*?function\s+(\w+).*?expected:\s*(\w+),\s*actual:\s*(\w+)/)))
      return `${m[1]}() expects a ${m[2]} but received a ${m[3]}`;

    if ((m = msg.match(/char(?:acter)?\s+(\d+)/i))) {
      const pos = parseInt(m[1], 10);
      const ch  = originalExpr?.[pos - 1];
      return `Syntax error at position ${pos}${ch ? ` (near "${ch}")` : ""}`;
    }

    if (/unexpected end/i.test(msg))
      return "Unexpected end of expression \u2014 is the expression complete?";

    if ((m = msg.match(/[Uu]nexpected token\s+['"]?([^'"\s,]+)/)))
      return `Unexpected "${m[1]}" in expression`;

    return msg.replace(/\s*\(char \d+\)/g, "").replace(/\s*at index \d+/g, "").trim();
  };

  exports.calc = CalcWidget;

})();
