# 🧮 TiddlyWiki Math.js Widget

[English](README.md) · **Français**

![Status](https://img.shields.io/badge/status-experimental-orange)

Ce projet est en développement actif et n'est pas prêt pour la production.  
Attendez-vous à des changements incompatibles, à un comportement instable et à des ajustements continus de l'API.

## Présentation

Un widget TiddlyWiki léger qui intègre Math.js pour évaluer des expressions
en ligne, avec :

- un séparateur décimal configurable (`point` ou `comma`)
- une saisie en notation anglaise : point décimal, séparateurs de milliers (espace ou virgule anglaise), notation scientifique
- une précision numérique configurable (float ou BigNumber)
- un résultat qui tient compte des unités, avec simplification automatique
- un cache LRU pour les performances
- une validation statique des expressions avec des messages d'erreur explicites
- un rendu KaTeX par défaut quand le plugin est installé ; repli en douceur sur du texte brut

## Fonctionnalités

**Moteur Math.js**

- arithmétique et algèbre
- fonctions : `sin`, `cos`, `sqrt`, `log`, `factorial`, `gcd`, et [toutes les autres](https://mathjs.org/docs/reference/functions.html)
- unités avec simplification automatique et conversion explicite par `to`
- nombres complexes (`2 + 3i`, `sqrt(-1)` → affichés normalement)

**Opérateurs et symboles Unicode**

| Symbole | Signification | Normalisé en |
|---|---|---|
| `×` (U+00D7) | multiplication | `*` |
| `·` (U+00B7) | point médian | `*` |
| `÷` (U+00F7) | division | `/` |
| `−` (U+2212) | signe moins | `-` |
| `–` (U+2013) | tiret demi-cadratin | `-` |
| `°` (U+00B0) | degré | ` deg` |
| `√x` | racine carrée | `sqrt(x)` |
| `∛x` | racine cubique | `cbrt(x)` |
| `π` | pi | `pi` |
| `τ` | tau = 2π | `(2*pi)` |
| `∞` | infini | `Infinity` |
| `ℯ` (U+212F) | nombre d'Euler | `e` |
| `‐` (U+2010) | trait d'union | `-` |
| `x⁰`–`x⁹` | chiffres en exposant (0–9) | `x^0`–`x^9` |
| `½` `¼` `¾` … | fractions usuelles (½ ⅓ ⅔ ¼ ¾ ⅕–⅘ ⅙ ⅚ ⅛–⅞) | `(1/2)` etc. |

**Modes de notation**

```
<$math notation="auto">0.00000012</$math>       <!-- passe en scientifique -->
<$math notation="fixed" precision="2">3.14</$math>
<$math notation="bin">42</$math>                <!-- 0b101010 -->
<$math notation="hex">255</$math>               <!-- 0xff -->
```

| Valeur | Comportement |
|---|---|
| `auto` (défaut) | décimal ; scientifique pour \|x\| < 1e-3 ou \|x\| ≥ 1e4 (ISO 80000-1 : > 4 chiffres significatifs) |
| `fixed` | toujours décimal |
| `scientific` | toujours scientifique |
| `engineering` | exposant toujours multiple de 3 |
| `bin` | binaire, préfixé `0b` |
| `oct` | octal, préfixé `0o` |
| `hex` | hexadécimal, préfixé `0x` |

**Séparateur décimal**

L'**espace fine insécable (U+202F, NNBSP)** sert toujours de séparateur de milliers,
conformément à l'ISO 80000-1. Seul le séparateur décimal change :

| `decimal` | Décimale | Exemple |
|---|---|---|
| `point` (défaut) | `.` | `1 234 567.89` |
| `comma` | `,` | `1 234 567,89` |

Les exposants de la notation scientifique utilisent des exposants Unicode : `1.23 × 10⁻⁶` (et non `10^-6`).

**Rendu des formules**

`show="formula"` et `show="full"` composent l'expression. Avec `output="katex"` (défaut),
KaTeX en assure le rendu. Avec `output="text"`, un formateur la convertit en texte brut lisible :

| Saisie | KaTeX | Texte brut |
|---|---|---|
| `sqrt(x^2+1)` | `\sqrt{x^{2}+1}` | `√(x²+1)` |
| `(a+b)/c` | `\frac{a+b}{c}` | `(a+b)/c` |
| `pi * r^2` | `\pi\cdot r^{2}` | `π·r²` |
| `factorial(n)` | `n!` | `n!` |
| `log10(x)` | `\log_{10}\left(x\right)` | `log₁₀(x)` |
| `pi * 1000000` | KaTeX | `π · 1 000 000` |

```
<$math show="formula">(a+b)/c</$math>
<$math show="full" mode="block">sqrt(x^2 + 1)</$math>
<$math output="text" show="formula">pi * r^2</$math>
```

> Avec `show="formula"`, l'expression n'est pas évaluée — `notation`,
> `precision`, `calcPrec` et `scope` sont ignorés.

> Quand le corps est un **littéral numérique simple** (ex. `42`, `-3.14`),
> `show="formula"` et `show="full"` se replient automatiquement sur `show="result"`
> (la formule est la valeur elle-même — il n'y a rien de distinct à montrer).

**Performances**

- cache LRU (500 entrées) — des expressions identiques d'un cycle de rafraîchissement à l'autre ne coûtent rien
- invalidation ciblée du cache quand un tiddler référencé change
- sortie anticipée au rendu — pas de nouveau rendu quand le texte de l'expression n'a pas changé

**Validation statique**

Avant toute évaluation, les identifiants inconnus sont détectés, avec une suggestion « did you mean? » fondée sur la distance de Levenshtein (ex. `sqt` → `did you mean "sqrt"?`). Les erreurs de syntaxe de mathjs sont reformulées avec leur position (`Syntax error at position 4, near ")"`). Tous les messages d'erreur sont différés de 200 ms pour éviter le clignotement pendant la frappe.

## Attributs

| Attribut | Valeurs | Défaut | Description |
|---|---|---|---|
| `output` | `katex` · `text` | `katex` | Moteur de rendu — KaTeX ou texte brut |
| `show` | `result` · `formula` · `full` | `result` | Ce qu'il faut afficher. `formula`/`full` se replient sur `result` quand le corps est un simple littéral. |
| `mode` | `inline` · `block` | `inline` | Mode d'affichage. KaTeX : mode de rendu. `output="text"` : centre le résultat dans un `<div>` bloc. |
| `decimal` | `point` · `comma` | `point` | Séparateur décimal — `point` (1.5) ou `comma` (1,5). Le séparateur de milliers est toujours la NNBSP. |
| `notation` | `auto` · `fixed` · `scientific` · `engineering` · `bin` · `oct` · `hex` | `auto` | Notation numérique du résultat |
| `precision` | entier positif | 6 | Chiffres affichés — chiffres significatifs pour `auto`/`scientific`/`engineering`, décimales après la virgule pour `fixed` ; ignoré pour `bin`/`oct`/`hex` |
| `calcPrec` | `float` · `64` · `128` · `256` | `float` | Mode de précision arithmétique — voir l'avertissement plus bas |
| `scope` | titre de tiddler ou `{a:1, b:2}` | — | Portée de variables injectée dans l'expression |
| `silence` | `yes` · `no` | `no` | Masquer l'affichage des erreurs de l'expression |

**Quand `silence="yes"` est-il utile ?**

`silence="yes"` masque les erreurs qui viennent de *l'expression elle-même*.
L'utiliser quand une expression est volontairement incomplète ou invalide selon les cas :

- L'expression dépend d'une variable TiddlyWiki (`<<myVar>>`) qui n'est pas
  encore définie — le widget afficherait une erreur tant que la variable n'est pas renseignée.
- Un tableau dont certaines cellules n'ont pas encore de valeur, ce qui fait
  temporairement échouer leurs expressions.
- Un contexte d'aperçu en direct où l'expression est tapée petit à petit et est
  invalide la plupart du temps.

Le délai de 200 ms couvre déjà l'invalidité passagère pendant la frappe.
`silence` couvre les cas où l'expression reste invalide même une fois
stabilisée — et où ne rien afficher vaut mieux qu'un message d'erreur
permanent.

## Utilisation

**Base**

```
<$math>1 + 2 * 3</$math>
```

**Séparateur décimal**

```
<$math decimal="comma">1234567.89</$math>
```

**Modes d'affichage**

```
<$math show="result">sqrt(2)</$math>
<$math show="formula">sqrt(2)</$math>
<$math show="full" mode="block">sqrt(x^2 + 1)</$math>
```

**Forcer un résultat en texte brut**

```
<$math output="text" show="formula">pi * r^2</$math>
```

**Notation**

```
<$math notation="scientific">0.00000012</$math>
<$math notation="engineering" decimal="comma">1234567</$math>
<$math notation="fixed" precision="2">3.14159</$math>
<$math notation="bin">42</$math>
<$math notation="oct">42</$math>
<$math notation="hex">255</$math>
```

Pour `bin`, `oct` et `hex` : `decimal` et `precision` sont ignorés. Les valeurs non entières sont tronquées sans avertissement (`3.7` → `3`). Un résultat avec unité produit une erreur — utiliser `number(expr, unit)` pour extraire d'abord la valeur numérique.

**Masquer les erreurs**

```
<$math silence="yes">bad expression</$math>
```

N'affiche rien en cas d'erreur au lieu d'un message d'erreur.

**Précision de calcul**

```
<$math calcPrec="64">1e13 + 1.23456789 - 1e13</$math>
```

Voir la section [Précision et performances](#précision-et-performances) pour
savoir quand utiliser chaque mode.

**Portée des variables — attribut `scope`**

**Mode tiddler**

```
<$math scope="MyVars">pi * r^2</$math>
```

`MyVars` est un tiddler contenant une ligne `nom: expression` par variable, évaluées dans l'ordre :

```
r: 5
h: 10
vol: pi * r^2 * h
```

**Mode en ligne**

```
<$math scope="{r: 3, h: 10}">pi * r^2 * h</$math>
```

Règles pour les clés :
- uniquement des identifiants mathjs valides : `[a-zA-Z_$][a-zA-Z0-9_$]*`
- `r2` ✓ · `my_var` ✓ · `2r` ✗ · `my-var` ✗
- pas de guillemets autour des clés : `{a:1}` et non `{"a":1}`
- `math.unit(5 cm)` est mis entre guillemets automatiquement — l'écrire sans guillemets intérieurs

**Unités**

```
<$math>9.81 m/s^2 * 80 kg</$math>
<$math>460 V * 20 A * 30 days to kWh</$math>
<$math>100 degF to degC</$math>
<$math>5 cm + 2 m to inch</$math>
```

**Saisie en notation scientifique**

La notation standard `5e9`, `1.5e-3`, `2.5e+6` est entièrement prise en charge.

> N'écrivez **pas** `5 * e9` — cela signifie 5 fois un symbole `e9` non défini.

## Identifiants réservés

mathjs prédéfinit deux constantes d'une seule lettre qui ne peuvent pas servir
de noms de variable sans être écrasées silencieusement :

| Identifiant | Signification dans mathjs |
|---|---|
| `e` | nombre d'Euler, 2,718281828… (aussi `ℯ` U+212F) |
| `i` | unité imaginaire, √−1 |

Définir `e` ou `i` dans le `scope` masque ces constantes pour toute
l'expression. Utiliser plutôt des noms sans ambiguïté : `euler`, `base`, `idx`, `imag`, etc.

## Précision et performances

**Par défaut : float**

Par défaut, le widget utilise le `float64` IEEE 754 natif — le type `Number`
standard de JavaScript (~16 chiffres significatifs). Le formateur affiche par
défaut 6 décimales (valeur par défaut de `precision`), ce qui suffit déjà à
masquer la plupart des artefacts du calcul flottant visibles à l'œil :

| Expression | Float brut | Affiché (12 déc.) |
|---|---|---|
| `0.1 + 0.2` | `0.30000000000000004` | `0.3` ✅ |
| `9.81 * 80` | `784.8000000000001` | `784.8` ✅ |

Utiliser float pour la grande majorité des expressions.

**Quand utiliser BigNumber**

Ne passer à un mode de précision BigNumber que lorsque float produit un
**résultat visiblement faux** que le plafond de précision par défaut ne peut pas corriger :

| Situation | Exemple | Résultat float | Résultat BigNumber |
|---|---|---|---|
| Annulation catastrophique | `1e13 + 1.23456789 - 1e13` | `1.234375` ❌ | `1.23456789` ✅ |
| Résidu de soustraction | `0.3 - 0.1 - 0.1 - 0.1` | `-2.78e-17` ❌ | `0` ✅ |
| Entier > MAX_SAFE_INTEGER | `9007199254740993` | `9007199254740992` ❌ | `9007199254740993` ✅ |

**Modes de précision de calcul**

| `calcPrec` | Moteur | Chiffres significatifs | Coût typique par rapport à float |
|---|---|---|---|
| `float` (défaut) | IEEE 754 | ~16 | 1× (référence) |
| `64` | BigNumber | 64 | ~3–4× plus lent |
| `128` | BigNumber | 128 | ~5–6× plus lent |
| `256` | BigNumber | 256 | ~8–10× plus lent |

**Précision affichée et précision interne**

`calcPrec` règle la précision interne. `precision` règle les chiffres visibles.
Augmenter `calcPrec` ne produit **pas** davantage de chiffres visibles — BigNumber
ne fait que réduire les erreurs d'arrondi dans les étapes intermédiaires.

> **Nombre de chiffres BigNumber et bits :**  
> `calcPrec="64"` signifie 64 *chiffres décimaux significatifs* (~213 bits), et non 64 bits.  
> `calcPrec="128"` correspond à ~425 bits. Ne pas confondre avec les largeurs en bits de l'IEEE 754.

**Précision d'affichage par défaut**

| Notation | Défaut du plugin | Plage usuelle en pratique |
|---|---|---|
| `auto` | 6 chiffres sig. | — |
| `fixed` | 6 décimales | 2–4 (grand public) · 6–15 (technique) |
| `scientific` | 6 chiffres sig. | 3–5 (publications) · 6–8 (travaux scientifiques avancés) |
| `engineering` | 6 chiffres sig. | 3–4 (les composants physiques en exigent rarement plus) |
| `bin` · `oct` · `hex` | — | `precision` ignoré — math.js produit le nombre exact de chiffres |

**Seuils de performance (mesurés sur V8/Node.js)**

| `calcPrec` | µs/éval. (arithmétique) | µs/éval. (`sin`/`cos`) | Widgets avant saccades |
|---|---|---|---|
| `float` | ~13 µs | ~14 µs | >1000 ✅ |
| `64` | ~66 µs | ~925 µs | ~240 (arith.) / ~17 (trigo) |
| `128` | ~169 µs | ~1 957 µs | ~94 (arith.) / ~8 (trigo) |
| `256` | ~89 µs | ~5 346 µs | ~180 (arith.) / ~3 (trigo) |

Grâce au cache LRU, ces coûts ne s'appliquent qu'à la première évaluation de
chaque expression distincte, à chaque modification de tiddler.

**Limite stricte : fonctions trigonométriques en haute précision**

`sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh` sont calculées en
interne par decimal.js. Elles lèvent `[DecimalError] Precision limit exceeded` à
partir d'une précision **≥ 510**. Le widget plafonne les options BigNumber à 256,
bien en deçà de cette limite.

## Installation

**Démo en ligne** : [https://nikorion.github.io/TW-Math/](https://nikorion.github.io/TW-Math/) — pour essayer le plugin avant de l'installer.

**Depuis la bibliothèque de plugins nikorion** (TiddlyWiki propose ensuite chaque nouvelle version en mise à jour) :

1. Dans votre wiki, créer un tiddler tagué `$:/tags/PluginLibrary`, avec un champ `url` valant `https://nikorion.github.io/tw-dev/library/index.html` et une `caption` comme `nikorion`.
2. Ouvrir *Panneau de configuration → Plugins → Obtenir d'autres plugins*, choisir la bibliothèque nikorion et installer **Math**.

**À la main** : télécharger [`TW-Math-Plugin.json`](https://nikorion.github.io/TW-Math/TW-Math-Plugin.json) et le glisser-déposer sur votre wiki.

Nécessite TiddlyWiki ≥ 5.2.0.

> KaTeX (`$:/plugins/tiddlywiki/katex`) est facultatif — le widget se replie automatiquement sur du texte brut en son absence.

## Liens

- GitHub : <https://github.com/nikorion/TW-Math>
- Démo en ligne : bientôt

## Notes techniques

- Repose sur [Math.js](https://mathjs.org/) — instance float ou BigNumber selon `calcPrec`
- Utilise le cycle de vie des widgets TiddlyWiki (`render` / `refresh`)
- Aucune dépendance d'exécution hormis Math.js (KaTeX est facultatif)
- Conçu pour les wikis en un seul fichier
- Clé de cache : `[tiddler-title, normalized-expr, calcPrec, scope-attr]`

## Limites

- Ce n'est pas un tableur — pas de graphe de dépendances entre tiddlers
- Pas de propagation réactive des variables d'un widget à l'autre
- Le bac à sable est heuristique, ce n'est pas une VM sécurisée
- La sortie KaTeX couvre les cas courants ; le LaTeX avancé (`\color`, `\align`, `\underbrace`) exige d'écrire du LaTeX brut via `<$katex />`

## Feuille de route

- meilleur formatage des unités
- mode de sortie en source LaTeX
- bac à sable plus strict
- outils de profilage des performances

## Historique des versions

**v0.5.0 — 2026-07-02**

**Changement incompatible :** le widget s'appelle désormais `<$math>` au lieu de `<$calc>`. Mettre à jour
tout le wikitext qui utilise le plugin.

**v0.4.0 — 2026-06-15**

Passe de qualité sur `output=text`. Tous les modes utilisent désormais la NNBSP (U+202F) comme séparateur
de milliers (l'anglais utilisait auparavant des virgules — non standard).
Les exposants de la notation scientifique s'affichent désormais en exposants Unicode (`10⁻⁶` au lieu de `10^-6`).
`show=formula` et `show=full` en mode texte groupent désormais les chiffres des grands nombres
(`1 000 000`) et respectent l'attribut `decimal` pour le séparateur décimal. Quand le
corps de l'expression est un simple littéral numérique, `show=formula` / `show=full`
se replient automatiquement sur `show=result`. `mode=block` est désormais pris en compte pour
`output=text` (auparavant ignoré) — le résultat est enveloppé dans un `<div>` bloc centré.

**v0.3.0 — 2026-06-13**

Nouvel attribut `output` (`katex` par défaut / `text`). KaTeX devient actif par défaut
plutôt que sur demande : actif dès que le plugin est installé, avec sinon un repli en douceur
sur du texte brut mis en forme. Le mode texte brut utilise un nouveau
formateur (`prettyprint.js`) pour le rendu des formules (π, ·, exposants,
√, ∛, !, log₂…). Les nombres complexes s'affichent désormais normalement au lieu de
produire une erreur. Les températures s'affichent avec les symboles `°C` / `°F`.
La notation en base entière (`bin`/`oct`/`hex`) tronque désormais correctement les valeurs non entières.
La virgule à l'anglaise est acceptée comme séparateur de milliers en saisie (`1,000,000`).

**v0.2.0 — 2026-06-12**

API simplifiée : `show` et `mode` remplacent `render` ; la saisie est désormais en anglais uniquement ; tout
résultat passe par KaTeX (avec repli sur du texte brut). Le nouveau mode `show="full"`
affiche ensemble la formule et le résultat. `notation` remplace `scientific` (et gagne
`"bin"`, `"oct"`, `"hex"` pour un résultat en base entière). `scope` remplace `data`.
`calcPrec` remplace `precision` pour la précision de calcul ; `precision` désigne désormais
le nombre de chiffres affichés.

**v0.1.0 — 2026-06-06**

Première version publique. Met en place la structure du plugin et la chaîne
d'évaluation. Toutes les fonctionnalités sont expérimentales et sujettes à des changements incompatibles.

## Crédits

Inspiré du [tiddly-mathjs](https://github.com/mklauber/tiddly-mathjs) original
de mklauber. Les schémas d'intégration à TiddlyWiki et la structure générale
dérivent de ce travail.

Évaluation mathématique par [Math.js](https://github.com/josdejong/mathjs),
créé par Jos de Jong et la communauté Math.js.

Icône issue de [SVG Repo](https://www.svgrepo.com/svg/260088/calculator) —
voir les conditions d'utilisation de SVG Repo.

Développé avec l'aide d'OpenAI ChatGPT et d'Anthropic Claude pour la revue de code,
le refactoring et la documentation.

## Licence

Licence MIT — voir `LICENSE`  
Inclut Math.js (Apache 2.0)
