/*\
title: $:/plugins/nikorion/math/modules/calc.js
type: application/javascript
module-type: widget
\*/

/*
 * calc.js — <$calc> widget 🧮
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
 *                                    (π, ·, superscripts, √, ∛, !, log₂…).
 *                         "full"     formula = result.
 *
 *   mode       {string}   KaTeX display mode — ignored when output="text".
 *                         Default: "inline".
 *                         "inline"   rendered inline with surrounding text.
 *                         "block"    centred display-mode formula (larger).
 *
 *   locale     {string}   Output locale for number formatting.
 *                         Controls decimal separator, thousands separator,
 *                         and digit grouping via Intl.NumberFormat.
 *                         Short aliases:  "en" → "en-US" (default)
 *                                         "fr" → "fr-FR"
 *                         Any valid BCP-47 tag also works: "de-DE", etc.
 *
 *   notation   {string}   Output notation mode.  Default: "auto".
 *                         "auto"        scientific for |x|<1e-6 or |x|>1e12.
 *                         "fixed"       always decimal.
 *                         "scientific"  always scientific.
 *                         "engineering" engineering notation (exponent % 3).
 *                         "bin"         binary,      prefixed "0b" (e.g. "0b101010").
 *                         "oct"         octal,       prefixed "0o" (e.g. "0o52").
 *                         "hex"         hexadecimal, prefixed "0x" (e.g. "0xff").
 *                         ⚠️ bin/oct/hex: locale and precision are ignored.
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
 *                         Values pass through normalize() + sanitize().
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
 * ── Error debouncing ─────────────────────────────────────────────────
 * Expression errors delayed ERROR_DELAY ms (anti-flicker while typing).
 *
 * ── Pipelines ────────────────────────────────────────────────────────
 *   output="text"
 *     show="result"  normalize → scope → sanitize → cache → evaluate → check → format
 *     show="formula" normalize → prettyprint
 *     show="full"    normalize → prettyprint + " = " + format
 *
 *   output="katex"
 *     show="result"  normalize → scope → sanitize → cache → evaluate → check → formatResultKatex
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
  const sanitize     = require("$:/plugins/nikorion/math/modules/sanitize.js");
  const format       = require("$:/plugins/nikorion/math/modules/format.js");
  const prettyprint  = require("$:/plugins/nikorion/math/modules/prettyprint.js");
  const cache        = require("$:/plugins/nikorion/math/modules/cache.js");
  const scopeBuilder = require("$:/plugins/nikorion/math/modules/scope.js");
  const mathInstance = require("$:/plugins/nikorion/math/modules/mathinstance.js");
  const renderer     = require("$:/plugins/nikorion/math/modules/renderer.js");
  const errors       = require("$:/plugins/nikorion/math/modules/errors.js");

  const ERROR_DELAY = 200; // ms ⏱️

  // ─────────────────────────────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────────────────────────────
  function CalcWidget(parseTreeNode, options) {
    this.initialise(parseTreeNode, options);
    this._errorTimer  = null;
    this._katexWidget = null;
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

    this.expression = this.document.createElement("div");
    this.renderChildren(this.expression);
    const expr = this.expression.textContent.trim();

    if (this.domNodes.length > 0 && this.lastExpr === expr) return false;
    this.lastExpr = expr;

    if (!expr) {
      renderer.displayText(this, "$calc widget awaiting input...", parent, nextSibling);
      return;
    }

    this._renderResult(expr, parent, nextSibling);
  };

  // ─────────────────────────────────────────────────────────────────────
  // refresh — called by TiddlyWiki on every tiddler change
  // ─────────────────────────────────────────────────────────────────────
  CalcWidget.prototype.refresh = function (changedTiddlers) {
    const tid        = this.getVariable("currentTiddler");
    const scopeTitle = this.getAttribute("scope", "");

    if (changedTiddlers[tid])                     cache.clear(tid);
    if (scopeTitle && changedTiddlers[scopeTitle]) cache.clear(tid);

    const changed = this.computeAttributes();
    if (changed["locale"]  || changed["notation"] || changed["show"] ||
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
  // _renderResult — run the pipeline then display with error debouncing
  // ─────────────────────────────────────────────────────────────────────
  CalcWidget.prototype._renderResult = function (expr, parent, nextSibling) {
    const outcome = this._evaluate(expr);

    if (outcome.ok) {
      this._cancelErrorTimer();
      if (outcome.useKatex) {
        const isBlock = this.getAttribute("mode", "inline") === "block";
        renderer.displayKatex(this, outcome.tex, isBlock, parent, nextSibling);
      } else {
        renderer.displayText(this, outcome.text, parent, nextSibling);
      }
      return;
    }

    this._cancelErrorTimer();
    if (this.getAttribute("silence", "no") !== "yes") {
      this._errorTimer = setTimeout(() => {
        this._errorTimer = null;
        renderer.displayText(this, outcome.text, parent, nextSibling);
      }, ERROR_DELAY);
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // _cancelErrorTimer
  // ─────────────────────────────────────────────────────────────────────
  CalcWidget.prototype._cancelErrorTimer = function () {
    if (this._errorTimer !== null) {
      clearTimeout(this._errorTimer);
      this._errorTimer = null;
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // _evaluate — full pipeline 🔬
  //
  //   output="text"
  //     show="result"  normalize → scope → sanitize → cache → evaluate → check → format
  //     show="formula" expr (raw)
  //     show="full"    expr (raw) + " = " + format
  //
  //   output="katex"
  //     show="result"  normalize → scope → sanitize → cache → evaluate → check → formatResultKatex
  //     show="formula" normalize → parse().toTex() → formatKatexFR
  //     show="full"    normalize → [formula pipeline] + [result pipeline] → join with "="
  //
  // Returns { ok: true, useKatex: bool, tex?, text? }
  //      or { ok: false, text: "Error: …" }
  // ─────────────────────────────────────────────────────────────────────
  CalcWidget.prototype._evaluate = function (expr) {
    const show      = this.getAttribute("show",   "result");
    const output    = this.getAttribute("output", "katex");
    const useKatex  = output === "katex";
    const calcPrec  = this.getAttribute("calcPrec", "float");
    const math      = mathInstance.getInstance(calcPrec);
    const localeRaw = this.getAttribute("locale", "en");
    const locale    = format.LOCALE_ALIASES[localeRaw] ?? localeRaw;

    try {
      const normalized = normalize.normalize(expr);                               // 1. normalize

      // ── text mode: formula/full use prettyprint, no evaluate needed ──
      if (!useKatex && show === "formula") {
        return { ok: true, useKatex: false, text: prettyprint.prettyprint(normalized) };
      }

      // ── katex formula pipeline ─────────────────────────────────────
      const formulaTex = (useKatex && (show === "formula" || show === "full"))
        ? format.formatKatexFR(math.parse(normalized).toTex(), locale)
        : null;

      if (useKatex && show === "formula") return { ok: true, useKatex: true, tex: formulaTex };

      // ── result pipeline (shared by text and katex) ─────────────────
      const notation  = this.getAttribute("notation",  "auto");
      // Validate display precision: parseInt("") / parseInt("abc") → NaN →
      // notation default; otherwise clamped to safe Intl/toExponential
      // bounds (0/1–100).  Prevents raw RangeErrors leaking to the user.
      const precision = format.clampPrecision(
        parseInt(this.getAttribute("precision", ""), 10), notation
      );
      const tid       = this.getVariable("currentTiddler");

      const scopeAttr = this.getAttribute("scope", "");
      let varScope;
      try {
        varScope = scopeBuilder.buildScope(                                        // 2. scope
          scopeAttr, this.wiki, math, normalize, sanitize
        );
      } catch (_) {
        throw new Error("Problem with the scope attribute");
      }
      sanitize.sanitize(normalized, math, varScope);                              // 3. sanitize

      // Key = raw-result identity: calcPrec changes the math instance (and the
      // result type/value), scope changes variable values.  notation/precision
      // only affect formatting, which happens AFTER cache retrieval.
      const key    = cache.key(tid, normalized, calcPrec, scopeAttr);             // 4. cache
      let   result = cache.get(key);

      if (result === null) {
        result = math.evaluate(normalized, varScope);                             // 5. evaluate
        const err = errors.checkResult(result);                                   // 6. check
        if (err) throw new Error(err);
        cache.set(key, result);
      }

      if (useKatex) {
        const resultTex = format.formatResultKatex(result, locale, { notation, precision }); // 7a. format katex
        if (show === "full") return { ok: true, useKatex: true, tex: `${formulaTex} = ${resultTex}` };
        return { ok: true, useKatex: true, tex: resultTex };
      } else {
        const resultText   = format.format(result, locale, { notation, precision }); // 7b. format text
        const formulaText  = prettyprint.prettyprint(normalized);                    // 7b. prettyprint
        if (show === "full") return { ok: true, useKatex: false, text: `${formulaText} = ${resultText}` };
        return { ok: true, useKatex: false, text: resultText };
      }

    } catch (e) {
      return { ok: false, text: `Error: ${errors.rewriteError(e.message, expr)}` };
    }
  };

  exports.calc = CalcWidget;

})();