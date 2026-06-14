/*\
title: $:/plugins/nikorion/math/modules/renderer.js
type: application/javascript
module-type: library
\*/

/*
 * renderer.js — DOM output helpers 🖥️
 *
 * Handles the three output operations the <$calc> widget needs:
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

  // Cached result — null means unchecked, true/false means checked.
  var _katexAvailable = null;

  exports.isKatexAvailable = function isKatexAvailable(widget) {
    if (_katexAvailable !== null) return _katexAvailable;
    _katexAvailable = !!(widget.widgetClasses && widget.widgetClasses.katex);
    return _katexAvailable;
  };

  exports.clearOutput = function clearOutput(widget) {
    widget.removeChildDomNodes();
    widget._katexWidget = null;
  };

  exports.displayText = function displayText(widget, text, parent, nextSibling) {
    exports.clearOutput(widget);
    const node = widget.document.createTextNode(text);
    parent.insertBefore(node, nextSibling);
    widget.domNodes.push(node);
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