/*\
title: $:/plugins/nikorion/math/modules/math.widget.js
type: application/javascript
module-type: widget
\*/

/*
 * math.widget.js — <$math> widget 🧮
 *
 * Evaluates a math expression (widget body) via mathjs and renders the
 * result as plain text or via KaTeX, depending on the `output` attribute.
 *
 * ── Attributes ───────────────────────────────────────────────────────
 *
 *   output     {string}   Rendering backend.  Default: "katex".
 *                         "katex"  render via KaTeX if plugin is installed;
 *                                  falls back to plain text if plugin absent.
 *                         "text"   plain text with pretty-printed formulas —
 *                                  no KaTeX dependency.
 *
 *   show       {string}   What to display.  Default: "result".
 *                         "result"   evaluate the expression, display result.
 *                         "formula"  display the expression without evaluating.
 *                                    output="katex": via toTex() → KaTeX.
 *                                    output="text":  pretty-printed plain text
 *                                    (π, ·, superscripts √, ∛, !, log₂…).
 *                                    Numbers with 4+ digits get NNBSP (U+202F)
 *                                    as thousands separator; decimal follows the "decimal" attribute.
 *                         "full"     formula = result.
 *                         ⚠️ When the body is a plain numeric literal (e.g. "42"),
 *                            show="formula" and show="full" degrade to show="result"
 *                            (the formula IS the value — there is nothing to show).
 *
 *   mode       {string}   Display mode.  Default: "inline".
 *                         "inline"   rendered inline with surrounding text.
 *                         "block"    centred display-mode formula (larger).
 *                         For output="katex": KaTeX display mode.
 *                         For output="text":  result wrapped in a centred <div>.
 *
 *   decimal    {string}   Decimal separator.  Default: "point".
 *                         "point"   → period  (1.5)   — all English-style locales.
 *                         "comma"   → comma   (1,5)   — French, German, etc.
 *                         Thousands separator is always NNBSP (U+202F) per ISO 80000-1.
 *
 *   notation   {string}   Output notation mode.  Default: "auto".
 *                         "auto"        scientific for |x|<1e-6 or |x|>1e12.
 *                         "fixed"       always decimal.
 *                         "scientific"  always scientific.
 *                         "engineering" engineering notation (exponent % 3).
 *                         "bin"         binary,      prefixed "0b" (e.g. "0b101010").
 *                         "oct"         octal,       prefixed "0o" (e.g. "0o52").
 *                         "hex"         hexadecimal, prefixed "0x" (e.g. "0xff").
 *                         ⚠️ bin/oct/hex: decimal and precision are ignored.
 *                            Non-integer values are truncated silently (3.7 → 3).
 *                            Unit results produce an error — use number() to
 *                            extract the numeric value first.
 *
 *   precision  {number}   Display precision — number of digits shown.
 *                         auto/fixed → max decimal places (default 6).
 *                         scientific/engineering → significant digits (default 6).
 *                         Clamped to 1–100 (0–100 for fixed); non-numeric
 *                         values fall back to the notation default.
 *                         Ignored for bin/oct/hex (math.js always emits
 *                         the exact minimal digit count).
 *                         Independent from calcPrec. 👁️
 *
 *   calcPrec   {string}   Calculation precision mode.  Default: "float".
 *                         "float" — IEEE 754 float64 (~16 sig. digits). Fast.
 *                         "64"    — BigNumber 64 sig. digits.
 *                         "128"   — BigNumber 128 sig. digits.
 *                         "256"   — BigNumber 256 sig. digits.
 *                         ⚠️ Trig functions throw at calcPrec ≥ 510. 256 is safe.
 *                         ℹ️  With calcPrec="64/128/256", all numeric literals
 *                         are automatically BigNumber — no need for math.bignumber().
 *
 *   scope      {string}   Variable scope injected into math.evaluate().
 *
 *                         TIDDLER MODE 🗒️ — value matches an existing tiddler
 *                         title; text parsed line by line ("name: expr").
 *                         Values pass through normalize().
 *
 *                         INLINE MODE 📝 — JS object literal:
 *                           scope="{a:2, b:5}"
 *                         Keys: valid mathjs identifiers.
 *                         Values: EN notation (decimal point).
 *                         Pairs separated by commas.
 *                         math.unit(5 cm) auto-quoted.
 *                         Outer braces auto-added.
 *
 *   silence    {string}   "yes" → render nothing on error.  "no" (default).
 *
 * ── ⚠️  Reserved identifiers: e and i ────────────────────────────────
 * "e" = Euler's number (2.718…), "i" = imaginary unit (√−1).
 * Defining them in scope silently shadows the constants.
 *
 * ── Scientific notation input ─────────────────────────────────────────
 * "5e9", "1.5e-3" fully supported.
 *
 * ── calcPrec vs. precision ────────────────────────────────────────────
 * precision  → visible digits (display)
 * calcPrec   → BigNumber internal accuracy (invisible)
 * Raising calcPrec does NOT add visible digits.
 *
 * ── Pipelines ────────────────────────────────────────────────────────
 *   output="text"
 *     show="result"  normalize → scope → cache → evaluate → format
 *     show="formula" normalize → prettyprint(locale)   [or "result" if body is a literal]
 *     show="full"    normalize → prettyprint + " = " + format   [or "result" if literal]
 *
 *   output="katex"
 *     show="result"  normalize → scope → cache → evaluate → formatResultKatex
 *     show="formula" normalize → parse().toTex() → formatKatexFR
 *     show="full"    normalize → [formula pipeline] + [result pipeline] → join with "="
 *
 * ── KaTeX ────────────────────────────────────────────────────────────
 * KaTeX is used by default (output="katex") when the KaTeX plugin is
 * installed.  Falls back to plain text automatically if the plugin is
 * absent.  Force plain text with output="text".
 */

(function () {
  "use strict";

  const Widget       = require("$:/core/modules/widgets/widget.js").widget;
  const normalize    = require("$:/plugins/nikorion/math/modules/normalize.js");
  const format       = require("$:/plugins/nikorion/math/modules/format.js");
  const prettyprint  = require("$:/plugins/nikorion/math/modules/prettyprint.js");
  const cache        = require("$:/plugins/nikorion/math/modules/cache.js");
  const scopeBuilder = require("$:/plugins/nikorion/math/modules/scope.js");
  const mathInstance = require("$:/plugins/nikorion/math/modules/mathinstance.js");
  const renderer     = require("$:/plugins/nikorion/math/modules/renderer.js");
  const lang         = require("$:/plugins/nikorion/math/modules/lang.js");

  var DEFAULTS_PREFIX = "$:/config/nikorion/math/";

  // 3-tier attribute resolution:
  //   1. Explicit widget attribute  <$math notation="fixed">
  //   2. ControlPanel setting tiddler  $:/config/nikorion/math/<name>
  //      — a real tiddler when overridden, otherwise resolves transparently
  //      to the shipped shadow default (default-config.multids).
  //   3. Hard-coded default (fallback of last resort, in case the shadow
  //      default tiddler is ever missing).
  // This lets users set wiki-wide defaults via the ControlPanel without
  // forcing every widget to repeat the same attribute.
  function getAttr(widget, name, hardDefault) {
    var val = widget.getAttribute(name);
    if (val !== undefined) return val;
    var state = widget.wiki.getTiddlerText(DEFAULTS_PREFIX + name);
    return (state !== undefined && state.length > 0) ? state : hardDefault;
  }

  // ─────────────────────────────────────────────────────────────────────
  // isLiteralValue — true when the expression is a bare numeric constant.
  // Used to suppress show="formula"/"full" when there is nothing to "show"
  // (formula = the value itself, so formula/full modes are redundant).
  // Handles positive and negative literals (unary-minus ConstantNode).
  // ─────────────────────────────────────────────────────────────────────
  function isLiteralValue(normalized, math) {
    try {
      var tree = math.parse(normalized.trim());
      // Plain numeric constant: 42, 3.14
      if (tree.type === "ConstantNode") return true;
      // Negated constant: -3.14
      if (tree.type === "OperatorNode" && tree.op === "-" &&
          tree.args.length === 1 && tree.args[0].type === "ConstantNode") return true;
      // Number+unit literal: 1000 kg, 3.14 m (implicit multiply of constant × symbol)
      if (tree.type === "OperatorNode" && tree.op === "*" &&
          tree.implicit === true && tree.args.length === 2 &&
          tree.args[0].type === "ConstantNode" &&
          tree.args[1].type === "SymbolNode") return true;
      return false;
    } catch (_) { return false; }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────────────────────────────
  function MathWidget(parseTreeNode, options) {
    this.initialise(parseTreeNode, options);
    this._katexWidget = null;
  }

  MathWidget.prototype = new Widget();

  // ─────────────────────────────────────────────────────────────────────
  // render — called once when the widget is first inserted into the DOM
  // ─────────────────────────────────────────────────────────────────────
  MathWidget.prototype.render = function (parent, nextSibling) {
    this.parentDomNode = parent;
    this.nextSibling   = nextSibling;
    this.computeAttributes();
    this.execute();

    this.expression = this.document.createElement("div");
    this.renderChildren(this.expression);
    const expr = this.expression.textContent.trim();

    if (this.domNodes.length > 0 && this.lastExpr === expr) return false;
    this.lastExpr = expr;

    if (!expr) {
      renderer.displayText(this, lang.getString("Errors/AwaitingInput"), parent, nextSibling);
      return;
    }

    this._renderResult(expr, parent, nextSibling);
  };

  // ─────────────────────────────────────────────────────────────────────
  // refresh — called by TiddlyWiki on every tiddler change
  // ─────────────────────────────────────────────────────────────────────
  MathWidget.prototype.refresh = function (changedTiddlers) {
    const tid        = this.getVariable("currentTiddler");
    const scopeTitle = this.getAttribute("scope", "");

    if (changedTiddlers[tid])                     cache.clear(tid);
    if (scopeTitle && changedTiddlers[scopeTitle]) cache.clear(tid);

    var dp = DEFAULTS_PREFIX;
    if (changedTiddlers[dp+"output"]   || changedTiddlers[dp+"show"]      ||
        changedTiddlers[dp+"mode"]     || changedTiddlers[dp+"decimal"]   ||
        changedTiddlers[dp+"notation"] || changedTiddlers[dp+"precision"] ||
        changedTiddlers[dp+"calcPrec"] || changedTiddlers[dp+"silence"]) {
      this.refreshSelf();
      return true;
    }

    const changed = this.computeAttributes();
    if (changed["decimal"] || changed["notation"] || changed["show"] ||
        changed["mode"]    || changed["scope"]    || changed["calcPrec"] ||
        changed["precision"] || changed["output"]) {
      this.refreshSelf();
      return true;
    }

    if (this._katexWidget?.refresh(changedTiddlers)) return true;

    if (this.refreshChildren(changedTiddlers)) {
      this.refreshSelf();
      return true;
    }

    return false;
  };

  // ─────────────────────────────────────────────────────────────────────
  // _renderResult — run the pipeline then display result or error
  // ─────────────────────────────────────────────────────────────────────
  MathWidget.prototype._renderResult = function (expr, parent, nextSibling) {
    const outcome = this._evaluate(expr);
    const isBlock = getAttr(this, "mode", "inline") === "block";

    if (outcome.ok) {
      if (outcome.useKatex) {
        renderer.displayKatex(this, outcome.tex, isBlock, parent, nextSibling);
      } else {
        renderer.displayText(this, outcome.text, parent, nextSibling, isBlock);
      }
      return;
    }

    if (getAttr(this, "silence", "no") !== "yes") {
      renderer.displayText(this, outcome.text, parent, nextSibling);
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // _evaluate — full pipeline 🔬
  //
  //   output="text"
  //     show="result"  normalize → scope → cache → evaluate → format
  //     show="formula" expr (raw)
  //     show="full"    expr (raw) + " = " + format
  //
  //   output="katex"
  //     show="result"  normalize → scope → cache → evaluate → formatResultKatex
  //     show="formula" normalize → parse().toTex() → formatKatexFR
  //     show="full"    normalize → [formula pipeline] + [result pipeline] → join with "="
  //
  // Returns { ok: true, useKatex: bool, tex?, text? }
  //      or { ok: false, text: "Error: …" }
  // ─────────────────────────────────────────────────────────────────────
  MathWidget.prototype._evaluate = function (expr) {
    const show      = getAttr(this, "show",     "result");
    const output    = getAttr(this, "output",   "katex");
    const useKatex  = output === "katex" && renderer.isKatexAvailable(this);
    const calcPrec  = getAttr(this, "calcPrec", "float");
    const math      = mathInstance.getInstance(calcPrec);
    const decimal = getAttr(this, "decimal", "point");
    const locale  = decimal === "comma" ? "fr-FR" : "en-US";

    try {
      const normalized = normalize.normalize(expr);                               // 1. normalize

      // When the expression is a bare numeric literal (e.g. "42", "-3.14"),
      // show="formula" and show="full" are semantically identical to show="result"
      // (the formula IS the value), so we degrade them silently.
      const effectiveShow = (isLiteralValue(normalized, math) && show !== "result")
        ? "result" : show;

      // ── text mode: formula/full use prettyprint, no evaluate needed ──
      if (!useKatex && effectiveShow === "formula") {
        return { ok: true, useKatex: false, text: prettyprint.prettyprint(normalized, locale) };
      }

      // ── katex formula pipeline ─────────────────────────────────────
      const formulaTex = (useKatex && (effectiveShow === "formula" || effectiveShow === "full"))
        ? format.formatKatexFR(math.parse(normalized).toTex(), locale)
        : null;

      if (useKatex && effectiveShow === "formula") return { ok: true, useKatex: true, tex: formulaTex };

      // ── result pipeline (shared by text and katex) ─────────────────
      const notation       = getAttr(this, "notation", "auto");
      // Validate display precision: parseInt("") / parseInt("abc") → NaN →
      // notation default; otherwise clamped to safe Intl/toExponential
      // bounds (0/1–100).  Prevents raw RangeErrors leaking to the user.
      let precisionRaw = this.getAttribute("precision");
      if (precisionRaw === undefined) {
        precisionRaw = this.wiki.getTiddlerText(DEFAULTS_PREFIX + "precision") || "";
      }
      const precision         = format.clampPrecision(parseInt(precisionRaw, 10), notation);
      // Track whether the user explicitly set precision: only then do we
      // keep trailing zeros (ISO 80000-1 — zeros signal known accuracy).
      const precisionExplicit = precisionRaw !== "";
      const tid       = this.getVariable("currentTiddler");

      const scopeAttr = this.getAttribute("scope", "");
      let varScope;
      try {
        varScope = scopeBuilder.buildScope(                                        // 2. scope
          scopeAttr, this.wiki, math, normalize
        );
      } catch (_) {
        throw new Error(lang.getString("Errors/ScopeAttribute"));
      }

      // Key = raw-result identity: calcPrec changes the math instance (and the
      // result type/value), scope changes variable values.  notation/precision
      // only affect formatting, which happens AFTER cache retrieval.
      const key    = cache.key(tid, normalized, calcPrec, scopeAttr);             // 3. cache
      let   result = cache.get(key);

      if (result === null) {
        result = math.evaluate(normalized, varScope);                             // 4. evaluate
        cache.set(key, result);
      }

      if (useKatex) {
        const resultTex = format.formatResultKatex(result, locale, { notation, precision, precisionExplicit }); // 7a. format katex
        if (effectiveShow === "full") return { ok: true, useKatex: true, tex: `${formulaTex} = ${resultTex}` };
        return { ok: true, useKatex: true, tex: resultTex };
      } else {
        const resultText  = format.format(result, locale, { notation, precision, precisionExplicit }); // 7b. format text
        const formulaText = prettyprint.prettyprint(normalized, locale);             // 7b. prettyprint
        if (effectiveShow === "full") return { ok: true, useKatex: false, text: `${formulaText} = ${resultText}` };
        return { ok: true, useKatex: false, text: resultText };
      }

    } catch (e) {
      return { ok: false, text: lang.getString("Errors/ErrorPrefix") + ": " + e.message };
    }
  };

  exports.math = MathWidget;

})();
