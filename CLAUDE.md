# TW-Math — contexte projet pour Claude

## Ce que c'est
Plugin TiddlyWiki (`$:/plugins/nikorion/math`) qui expose un widget `<$calc>` évaluant des expressions mathématiques via **Math.js**. Rendu en texte brut ou KaTeX. Auteur : nikorion.

## Structure
```
plugins/nikorion/math/      ← sources du plugin (seul dossier à toucher)
  modules/
    calc.js                 ← widget principal, pipeline d'évaluation
    normalize.js            ← normalise la syntaxe avant évaluation
    sanitize.js             ← vérifie la sécurité de l'expression
    scope.js                ← construit le scope (variables injectées)
    cache.js                ← cache des résultats par tiddler+expression
    mathinstance.js         ← instance math.js (float ou BigNumber)
    format.js               ← formatage du résultat (locale, notation, KaTeX)
    prettyprint.js          ← rendu texte "joli" sans évaluation
    renderer.js             ← helpers DOM (texte, KaTeX, clear)
    errors.js               ← réécriture des messages d'erreur
    math.js                 ← Math.js 13.x minifié 632 KB — NE PAS MODIFIER
  tiddlers/
    examples.tid            ← page d'exemples (ouverte au démarrage dev)
    cheatsheet.tid
    test.tid
  assets/icon.svg(.meta)
  plugin.info               ← métadonnées du plugin
  readme.tid / history.tid / licence.tid / tree.tid

devwiki/                    ← wiki TW de développement (ne pas versionner StoryList/HistoryList)
  tiddlywiki.info           ← config : plugins chargés, targets build plugin-json + html
  tiddlers/                 ← tiddlers de config UI + $__dev-livereload.tid

dist/                       ← généré par pnpm build, gitignored
docs/                       ← TW-Math.html standalone (distribution)
```

## Workflow dev
```
pnpm install
pnpm lint     # ESLint sur modules/*.js (sauf math.js)
pnpm dev      # TW sur :8485 + livereload — ouvrir http://localhost:8485
pnpm build    # génère dist/plugin.json (bundle pour TW navigateur)
```

`pnpm dev` lance en parallèle :
- **nodemon** → surveille `plugins/nikorion/math`, relance `tiddlywiki devwiki --listen port=8485` à chaque changement
- **livereload** → surveille le même dossier, envoie le signal de rechargement au navigateur (wait 1500 ms)

Le tiddler `$__dev-livereload.tid` dans devwiki injecte le script livereload côté navigateur.

## Fichiers de config
- [package.json](package.json) — scripts pnpm, dépendances dev
- [nodemon.json](nodemon.json) — watch + exec pour le serveur TW
- [eslint.config.js](eslint.config.js) — lint ES2020, sourceType "script" (IIFE + require/exports)
- [devwiki/tiddlywiki.info](devwiki/tiddlywiki.info) — plugins actifs : math, katex, highlight, filesystem, tiddlyweb

## Architecture du widget (calc.js)
Pipeline dans `_evaluate()` :
1. `normalize` — uniformise la syntaxe (virgule décimale, opérateurs...)
2. `scope` (si attribut `scope`) — injecte des variables depuis un tiddler ou un littéral `{a:2, b:5}`
3. `sanitize` — bloque les expressions dangereuses
4. `cache` — clé = `tid + expr + calcPrec + scope`
5. `math.evaluate` — évaluation via l'instance math.js
6. `errors.checkResult` — valide le résultat (pas de matrice non scalaire, etc.)
7. `format` / `formatResultKatex` — rendu final

Attributs clés du widget : `output` (katex/text), `show` (result/formula/full), `mode` (inline/block), `locale` (en/fr/BCP-47), `notation` (auto/fixed/scientific/engineering/bin/oct/hex), `precision`, `calcPrec` (float/64/128/256), `scope`, `silence`.

## Conventions
- Tous les modules JS sont des IIFE `(function(){ "use strict"; ... })()` avec `require`/`exports` TiddlyWiki — **pas des ES modules**.
- `math.js` est une dépendance bundlée manuellement — ne jamais régénérer depuis npm.
- Le wiki de dev s'appelle `devwiki/` (pas `wiki/`).
- La conf ESLint a `sourceType: "script"` et `no-var: off` pour respecter le style existant.

## Référence TiddlyWiki
Le dépôt officiel TiddlyWiki5 est cloné localement dans `D:\projets\devops\tw\TiddlyWiki5` — s'y référer pour comprendre les APIs internes (widgets, modules core, système de tiddlers, etc.). Ce dépôt possède son propre `CLAUDE.md`.

## Points d'attention Windows
- `pnpm dev` nécessite **deux Ctrl+C** pour quitter : comportement normal sur Windows (les wrappers `.cmd` de nodemon/tiddlywiki demandent confirmation). Ne pas chercher à contourner — tentatives précédentes ont toutes échoué ou laissé le terminal dans un état sale.
- `pnpm build` : la target `plugin-json` écrit dans `../dist` (relatif à devwiki/).
