# TW-Math — contexte projet pour Claude

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
docs/                       ← TW-Math.html standalone (distribution)
```

## Build html (docs/) — publishFilter
La target `html` de `wiki/tiddlywiki.info` fait `--rendertiddler $:/core/save/all`, qui embarque **tout le store de tiddlers chargé dans wiki** (pas seulement le plugin) — thèmes, config UI, plugins tiers droppés dans `wiki/tiddlers/`, etc.

Pour éviter de publier des tiddlers de dev dans `docs/TW-Math-Wiki.html`, la target passe la variable `publishFilter` (mécanisme core, le même que celui utilisé par le bouton "Download full wiki" — voir `$:/core/save/all` / `SavingMechanism`) en args supplémentaires de `--rendertiddler` :
```json
"--rendertiddler", "$:/core/save/all", "TW-Math-Wiki.html", "text/plain", "",
"publishFilter", "-[[$:/dev/hmr]] -[[$:/config/dev/hmr-port]] -[[$:/config/SyncFilter]] -[[$:/plugins/wikilabs/link-to-tabs]] -[[$:/plugins/kookma/commander]] -[[$:/plugins/oeyoews/tiddlywiki-codemirror-6]]"
```
Le `""` avant `publishFilter` est le slot `template` (inutilisé, à laisser vide — sinon les index se décalent). Sont exclus : les tiddlers de dev du HMR (`$:/dev/hmr`, `$:/config/dev/hmr-port`, `$:/config/SyncFilter`) et les plugins tiers de confort sans rapport avec le widget math (`link-to-tabs`, `commander`, `codemirror-6` — installés dans `wiki/tiddlers/system/` par glisser-déposé pour le confort de dev). `katex`/`highlight` sont **gardés** car ils servent au rendu du plugin lui-même.

## Workflow dev
```
pnpm install
pnpm lint     # ESLint sur modules/*.js (sauf math.min.js)
pnpm dev      # TW sur :8080 (défaut ; port libre si occupé) + HMR SSE — l'URL est affichée
pnpm build    # génère dist/TW-Math-Plugin.json + docs/TW-Math-Wiki.html
```

`pnpm dev` lance `scripts/dev.cjs`, orchestrateur (calqué sur TW-Hover-Tilt, zéro dépendance ajoutée) qui :
1. résout le port TW (défaut **8080**, sinon un port libre aléatoire si 8080 est pris — ex. un autre `pnpm dev` en parallèle) et le port SSE du HMR (défaut **35730**, même logique) — « move aside » ;
2. écrit le port SSE résolu dans le tiddler git-ignoré `$:/config/dev/hmr-port` (fichier `wiki/tiddlers/$__dev-hmr-port.tid`), lu par le client navigateur ;
3. lance en parallèle (spawn direct, plus de `concurrently`) :
   - **nodemon** → reboote TW **uniquement** sur changement de module JS / `plugin.info` (port injecté via `--exec` ; celui de `nodemon.json` n'est qu'un fallback standalone)
   - **dev-hmr.cjs** (maison) → serveur SSE de **HMR de contenu** : les tiddlers `.tid`/`.multids` **et les assets** (`assets/icon.svg` et son `.meta`, tout `.css`/`.json`/image) modifiés sont poussés à chaud (override de shadow en mémoire, état préservé, pas de reload) ; seuls un module `.js` ou `plugin.info` déclenchent reboot + reload complet une fois TW prêt (sonde le port down→up)

Le client `$:/dev/hmr` (`wiki/tiddlers/system/$__dev-hmr.tid`) ouvre l'EventSource (port lu dans `$:/config/dev/hmr-port`, fallback 35730). Le garde-fou `$:/config/SyncFilter` (`wiki/tiddlers/system/$__config_SyncFilter.tid`) exclut le préfixe du plugin du sync tiddlyweb pour que les overrides HMR ne soient jamais persistés sur disque. Principe détaillé : `../guides/hmr-tiddlywiki.md`.

## Fichiers de config
- [package.json](package.json) — scripts pnpm, dépendances dev
- [scripts/dev.cjs](scripts/dev.cjs) — orchestrateur `pnpm dev` : résolution des ports (défaut/libre) + spawn nodemon & dev-hmr
- [scripts/dev-hmr.cjs](scripts/dev-hmr.cjs) — serveur SSE de HMR de contenu (+ reboot/reload sur changement de module)
- [nodemon.json](nodemon.json) — watch `modules/` + `plugin.info` seulement (port de fallback standalone ; `dev.cjs` surcharge le port réel)
- [eslint.config.js](eslint.config.js) — lint ES2020, sourceType "script" (IIFE + require/exports)
- [wiki/tiddlywiki.info](wiki/tiddlywiki.info) — plugins actifs : math, katex, highlight, filesystem, tiddlyweb

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

## Conventions
- Tous les modules JS sont des IIFE `(function(){ "use strict"; ... })()` avec `require`/`exports` TiddlyWiki — **pas des ES modules**.
- `math.min.js` est une dépendance bundlée manuellement — ne jamais régénérer depuis npm.
- La conf ESLint a `sourceType: "script"` et `no-var: off` pour respecter le style existant.

## Points d'attention Windows
- `pnpm dev` nécessite **deux Ctrl+C** pour quitter : comportement normal sur Windows (les wrappers `.cmd` de nodemon/tiddlywiki demandent confirmation). Ne pas chercher à contourner — tentatives précédentes ont toutes échoué ou laissé le terminal dans un état sale.
- `pnpm build` : la target `plugin-json` écrit dans `../dist` (relatif à wiki/).

## Pièges PowerShell — leçons apprises

### BOM UTF-8 ⚠️ CRITIQUE
`[System.Text.Encoding]::UTF8` en .NET écrit **toujours un BOM** (`EF BB BF`) en début de fichier.
TiddlyWiki ne reconnaît pas le header `/*\...\*/` si le fichier commence par un BOM → le module n'est jamais enregistré → `require()` dans les autres modules lève `Cannot find module`.

**Toujours écrire les fichiers JS TW sans BOM :**
```powershell
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
```

Et pour lire proprement (auto-strip BOM si présent) :
```powershell
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
if ($content[0] -eq [char]0xFEFF) { $content = $content.Substring(1) }
```

### Caractères Unicode dans les paramètres d'outils
Les séquences `\uXXXX` dans les paramètres XML/JSON des appels d'outils sont **décodées par la couche JSON** avant d'atteindre PowerShell. Écrire ` ` dans le paramètre `command` produit le caractère U+202F réel, pas les 6 octets ASCII ` `.

**Pour injecter des caractères Unicode dans une chaîne PowerShell :**
```powershell
$nnbsp = [char]0x202F   # NARROW NO-BREAK SPACE
$nbsp  = [char]0x00A0   # NON-BREAKING SPACE
```

**Pour construire une chaîne contenant des séquences d'échappement JS (` `) sans les interpréter :**
```powershell
$bs = [char]92   # backslash
$pattern = "/[" + $bs + "u202F" + $bs + "u00A0]/g"
# → produit la chaîne ASCII  /[  ]/g
```

### Fins de ligne — here-strings PowerShell
Les here-strings `@'...'@` et `@"..."@` sur Windows produisent des fins de ligne **CRLF** (`\r\n`). Si le fichier cible utilise LF, normaliser après insertion :
```powershell
$content = $content.Replace("`r`n", "`n")
```

### Ordre des arguments WriteAllText
```powershell
# CORRECT
[System.IO.File]::WriteAllText($path, $content, $encoding)
# FAUX (path et content inversés — exception avec le contenu du fichier comme nom de chemin)
[System.IO.File]::WriteAllText($content, $path, $encoding)
```

### Positions hardcodées dans les fichiers
Les offsets d'octets (`commentStart = 18028`, `funcEnd = 18781`) calculés à un instant T deviennent **faux** après toute édition du fichier. Toujours recalculer dynamiquement :
```powershell
$start = $content.IndexOf("function numericToKatex")
```

### Edit tool et caractères invisibles
L'outil Edit ne peut pas matcher des chaînes contenant des **caractères Unicode invisibles** (NNBSP U+202F, NBSP U+00A0) ni des emojis imbriqués dans les `old_string`. Utiliser PowerShell avec `String.Replace()` ou un remplacement positionnel via `String.Substring()` dans ces cas.

### ESLint — erreurs fréquentes sur ce projet
- `no-irregular-whitespace` : un caractère NNBSP/NBSP réel dans un regex (`/[ ]/g`) → utiliser l'échappement ASCII `/[  ]/g`
- `no-useless-escape` : `"\\\,"` au lieu de `"\\,"` dans une chaîne JS

## Commandes Git
Quand l'utilisateur demande un "git push", exécuter ces commandes dans l'ordre :
```powershell
pnpm lint
git add .
git commit -m "some changes"
git push
```
Si `pnpm lint` échoue, corriger les erreurs avant de continuer.

### Diagnostic "Cannot find module X" dans TiddlyWiki
Quand `math.widget.js` lève `Cannot find module '$:/plugins/nikorion/math/modules/format.js'` :
1. **BOM** — vérifier que le fichier ne commence pas par `EF BB BF` (cause la plus fréquente)
2. **Erreur de syntaxe** — `node --check fichier.js` (ne détecte que les erreurs syntaxiques, pas runtime)
3. **Erreur runtime** — le module existe et est valide syntaxiquement mais crashe à l'exécution (require échoue silencieusement côté TW)
4. **Header mal formé** — vérifier que `/*\`, `title:`, `module-type:` et `\*/` sont intacts en début de fichier
