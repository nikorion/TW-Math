# TW-Math — contexte projet pour Claude

> **Avant toute tâche sur ce plugin, consulter d'abord le `CLAUDE.md` du workspace** (`../CLAUDE.md`) et ses `guides/` : outillage de dev commun (pnpm, `dev.cjs`/HMR, Ctrl+C, git push), pièges PowerShell/Windows, `publishFilter`, conventions modules JS, symlink. Ci-dessous : uniquement le spécifique à TW-Math.

## Ce que c'est
Plugin TiddlyWiki (`$:/plugins/nikorion/math`) qui expose un widget `<$math>` évaluant des expressions mathématiques via **Math.js**. Rendu en texte brut ou KaTeX. Auteur : nikorion.

## Structure
```
src/math/                   ← sources du plugin (seul dossier à toucher)
  modules/
    math.widget.js          ← widget principal, pipeline d'évaluation
    normalize.js            ← normalise la syntaxe avant évaluation
    sanitize.js             ← vérifie la sécurité de l'expression
    scope.js                ← construit le scope (variables injectées)
    cache.js                ← cache des résultats par tiddler+expression
    mathinstance.js         ← instance math.js (float ou BigNumber)
    format.js               ← formatage du résultat (decimal, notation, KaTeX)
    prettyprint.js          ← rendu texte "joli" sans évaluation
    renderer.js             ← helpers DOM (texte, KaTeX, clear)
    errors.js               ← réécriture des messages d'erreur
    math.min.js             ← Math.js 13.x minifié 632 KB — NE PAS MODIFIER
  tiddlers/
    examples.tid            ← page d'exemples (ouverte au démarrage dev)
    cheatsheet.tid
    test.tid
  assets/icon.svg(.meta)
  plugin.info               ← métadonnées du plugin
  readme.tid / history.tid / licence.tid / tree.tid

wiki/                       ← wiki TW de développement (ne pas versionner StoryList/HistoryList)
  tiddlywiki.info           ← config : plugins chargés, targets build plugin-json + html
  tiddlers/                 ← tiddlers de config UI + system/$__dev-hmr.tid + system/$__config_SyncFilter.tid

dist/                       ← généré par pnpm build, gitignored
docs/                       ← TW-Math-Wiki.html standalone (distribution)
```

## Spécificités dev
- `pnpm build` → `dist/TW-Math-Plugin.json` + `docs/TW-Math-Wiki.html`. Build HTML `publishFilter` (`../guides/build-html-publishfilter.md`) : `katex`/`highlight` sont **gardés** (ils servent au rendu du plugin lui-même).
- HMR : les `.tid`/`.multids` et assets (`assets/icon.svg` + `.meta`) sont poussés à chaud ; seuls un module `.js` (dont `math.min.js`) ou `plugin.info` rebootent. `nodemon.json` surveille `modules/` + `plugin.info`.
- `wiki/tiddlywiki.info` — plugins actifs : math, katex, highlight, filesystem, tiddlyweb. `eslint.config.js` : ES2020.

## Architecture du widget (math.widget.js)
Pipeline dans `_evaluate()` :
1. `normalize` — uniformise la syntaxe (virgule décimale, opérateurs...)
2. `scope` (si attribut `scope`) — injecte des variables depuis un tiddler ou un littéral `{a:2, b:5}`
3. `sanitize` — bloque les expressions dangereuses
4. `cache` — clé = `tid + expr + calcPrec + scope`
5. `math.evaluate` — évaluation via l'instance math.js
6. `errors.checkResult` — valide le résultat (pas de matrice non scalaire, etc.)
7. `format` / `formatResultKatex` — rendu final

Attributs clés du widget : `output` (katex/text), `show` (result/formula/full), `mode` (inline/block), `decimal` (point/comma), `notation` (auto/fixed/scientific/engineering/bin/oct/hex), `precision`, `calcPrec` (float/64/128/256), `scope`, `silence`.

## Documentation du plugin
Lorsque l'utilisateur demande une mise à jour de la doc, vérifier la conformité de ces fichiers avec le codebase :
- `README.md` — doc principale (racine)
- `src/math/tiddlers/readme.tid` — readme embarqué dans TW
- `src/math/tiddlers/cheatsheet.tid` — référence attributs/notations
- `src/math/tiddlers/test.tid` — cas de test dans le wiki
- commentaires dans le code des fichiers .js

## Conventions spécifiques
- `math.min.js` est une dépendance bundlée manuellement — ne jamais régénérer depuis npm (règle générale des `*.min.js` : voir workspace).
