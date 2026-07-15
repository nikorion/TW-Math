/*\
title: $:/plugins/nikorion/math/modules/lang.js
type: application/javascript
module-type: library
\*/

/*
 * lang.js — localisation helper 🌐
 *
 * Resolves translated strings for the <$math> widget UI and error messages.
 *
 * TiddlyWiki stores the active language as a reference tiddler at
 * "$:/language" — its text is the title of the active language-pack tiddler
 * (e.g. "$:/languages/fr-FR"), which carries a `name` field ("fr-FR").
 *
 * Translation strings live under:
 *   $:/plugins/nikorion/math/language/<lang-code>/<key>
 *
 * For example:
 *   $:/plugins/nikorion/math/language/fr-FR/Errors/InvalidExpression
 *
 * Fallback chain:
 *   1. Active language (e.g. fr-FR)
 *   2. en-GB  — bundled with the plugin, always present
 *   3. The key itself — last resort; ensures the UI never shows a blank string
 *
 * Exported:
 *   getString(key) → string
 */

(function () {
  "use strict";

  // Base tiddler path shared by all language packs for this plugin.
  var LANG_BASE = "$:/plugins/nikorion/math/language/";
  // Fallback locale: en-GB is always bundled, so it is always resolvable.
  var FALLBACK  = "en-GB";

  // Read the active UI language code from TiddlyWiki's language reference.
  // "$:/language" holds the title of the active language-pack tiddler;
  // that tiddler's `name` field carries the BCP-47 tag (e.g. "fr-FR").
  // Returns FALLBACK when the language pack is absent or has no name field.
  function getLangCode() {
    var ref = ($tw.wiki.getTiddlerText("$:/language") || "").trim();
    if (!ref) return FALLBACK;
    var t = $tw.wiki.getTiddler(ref);
    return (t && t.fields && t.fields.name) ? t.fields.name : FALLBACK;
  }

  // Return a localised string for `key`.
  // Falls back to en-GB when the active language has no entry for `key`,
  // and returns `key` itself as a last resort so the UI never shows blank.
  exports.getString = function getString(key) {
    var code = getLangCode();
    var text = $tw.wiki.getTiddlerText(LANG_BASE + code + "/" + key);
    if (text !== undefined && text !== "") return text;
    text = $tw.wiki.getTiddlerText(LANG_BASE + FALLBACK + "/" + key);
    return (text !== undefined && text !== "") ? text : key;
  };

})();