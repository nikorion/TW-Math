/*\
title: $:/plugins/nikorion/math/modules/renderer.js
type: application/javascript
module-type: library
\*/

/*
 * renderer.js — DOM output helpers 🖥️
 *
 * Handles the three output operations the <$math> widget needs:
 *   • plain text node
 *   • KaTeX child widget (with plain-text fallback if plugin absent)
 *   • clear previously rendered output
 *
 * All functions receive the widget instance as `widget` so they can
 * access domNodes, makeChildWidget, removeChildDomNodes, and document.
 *
 * Exported:
 *   displayText(widget, text, parent, nextSibling)
 *   displayKatex(widget, text, displayMode, parent, nextSibling)
 *   clearOutput(widget)
 */

(function () {
  "use strict";

  // Cached availability flag — null means not yet checked.
  // KaTeX is either installed or not for the lifetime of the page, so one
  // check per page load is sufficient.  widgetClasses is populated at boot
  // before any widget renders, so the first call is always authoritative.
  var _katexAvailable = null;

  exports.isKatexAvailable = function isKatexAvailable(widget) {
    if (_katexAvailable !== null) return _katexAvailable;
    _katexAvailable = !!(widget.widgetClasses && widget.widgetClasses.katex);
    return _katexAvailable;
  };

  exports.clearOutput = function clearOutput(widget) {
    // Remove only the previously rendered OUTPUT nodes (text node or KaTeX
    // span — both pushed onto widget.domNodes).  Do NOT call
    // removeChildDomNodes() here: in TiddlyWiki that delegates to destroy(),
    // which wipes widget.children — i.e. the body widgets used to compute the
    // expression.  Without them, refreshChildren() can no longer detect edits
    // and the result stays frozen after the first character.  See math.widget.js
    // refresh(). 🧊
    for (const node of widget.domNodes) {
      if (node.parentNode) node.parentNode.removeChild(node);
    }
    widget.domNodes = [];
    widget._katexWidget = null;
  };

  exports.displayText = function displayText(widget, text, parent, nextSibling, isBlock) {
    exports.clearOutput(widget);
    if (isBlock) {
      const div = widget.document.createElement("div");
      div.className = "tc-math-block";
      div.style.cssText = "display:block;text-align:center;margin:0.5em 0";
      div.appendChild(widget.document.createTextNode(text));
      parent.insertBefore(div, nextSibling);
      widget.domNodes.push(div);
    } else {
      const node = widget.document.createTextNode(text);
      parent.insertBefore(node, nextSibling);
      widget.domNodes.push(node);
    }
  };

  exports.displayKatex = function displayKatex(widget, text, displayMode, parent, nextSibling) {
    exports.clearOutput(widget);

    const katexNode = {
      type: "katex",
      attributes: {
        text: { type: "string", value: text },
        ...(displayMode && { displayMode: { type: "string", value: "true" } }),
      },
      children: [],
    };

    const katexWidget = widget.makeChildWidget(katexNode);

    // Fallback: $katex widget type unknown → KaTeX plugin not installed. 🔄
    if (!katexWidget || katexWidget.type === "widget") {
      exports.displayText(widget, text, parent, nextSibling);
      return;
    }

    katexWidget.render(parent, nextSibling);
    widget._katexWidget = katexWidget;

    for (const node of (katexWidget.domNodes ?? [])) widget.domNodes.push(node);
  };

})();