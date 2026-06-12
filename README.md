# 🧮 TiddlyWiki Math.js Widget

![Status](https://img.shields.io/badge/status-experimental-orange)

This project is under active development and is not production-ready.  
Expect breaking changes, unstable behavior, and ongoing API adjustments.

---

## Overview

A lightweight TiddlyWiki widget integrating Math.js for inline expression
evaluation with:

- locale-aware output formatting (EN/FR/any BCP-47)
- configurable numeric precision (float or BigNumber)
- unit-aware output with automatic simplification
- LRU cache for performance
- static expression validation with friendly error messages
- scientific notation control
- KaTeX symbolic rendering (optional — requires KaTeX plugin)

---

## Features

### EN/international input

Accepts EN notation out of the box — decimal point, thousands space, scientific:

| Input | Interpretation |
|---|---|
| `1.2 + 3.4` | decimal point |
| `1 000 000 / 3` | thousands space |
| `5e9` · `1.5e-3` | scientific notation |

### Math.js engine

- arithmetic and algebra
- functions: `sin`, `cos`, `sqrt`, `log`, `factorial`, `gcd`, and [all others](https://mathjs.org/docs/reference/functions.html)
- units with auto-simplification and explicit `to` conversion
- complex numbers (`sqrt(-1)` → error with value, not a crash)

### Notation modes

```
<$calc notation="auto">0.00000012</$calc>       <!-- switches to scientific -->
<$calc notation="fixed" precision="2">3.14</$calc>
<$calc notation="bin">42</$calc>                <!-- 0b101010 -->
<$calc notation="hex">255</$calc>               <!-- 0xff -->
```

| Value | Behaviour |
|---|---|
| `auto` (default) | decimal; scientific for \|x\| < 1e-6 or \|x\| > 1e12 |
| `fixed` | always decimal |
| `scientific` | always scientific |
| `engineering` | exponent always multiple of 3 |
| `bin` | binary, prefixed `0b` |
| `oct` | octal, prefixed `0o` |
| `hex` | hexadecimal, prefixed `0x` |

### Locale-aware output

When `locale="fr-FR"`:

- decimal comma: `3,14`
- thin non-breaking space as thousands separator: `1 234 567`
- scientific style: `1,234 × 10^7`

### KaTeX symbolic rendering

Renders the expression as a typeset formula without evaluating it.
Requires the KaTeX plugin.

```
<$calc show="formula">(a+b)/c</$calc>
<$calc show="full" mode="block">sqrt(x^2 + 1)</$calc>
```

Automatic mathjs-to-LaTeX conversions:

| Input | LaTeX |
|---|---|
| `sqrt(x^2+1)` | `\sqrt{x^{2}+1}` |
| `(a+b)/c` | `\frac{a+b}{c}` |
| `pi` | `\pi` |

> When `show="formula"`, the expression is not evaluated — `notation`,
> `precision`, `calcPrec`, and `scope` are ignored.

### Performance

- LRU cache (500 entries) — identical expressions across refresh cycles cost nothing
- targeted cache invalidation when a referenced tiddler changes
- lazy DOM evaluation — skips re-render when output is unchanged

### Static validation

Before any evaluation:

- unbalanced parentheses detected with exact position
- unknown identifier detected with Levenshtein "did you mean?" suggestion
- error messages delayed 200 ms to suppress flicker while typing

---

## Attributes

| Attribute | Values | Default | Description |
|---|---|---|---|
| `show` | `result` · `formula` · `full` | `result` | What to display — result only, formula only, or both |
| `mode` | `inline` · `block` | `inline` | KaTeX display mode — inline or centred block |
| `locale` | `en` · `en-US` · `fr` · `fr-FR` · BCP-47 | `en` | Output number format (separators, decimal symbol) |
| `notation` | `auto` · `fixed` · `scientific` · `engineering` · `bin` · `oct` · `hex` | `auto` | Numeric output notation |
| `precision` | positive integer | 6 | Display digits — decimal places for `auto`/`fixed`, significant digits for `scientific`/`engineering`; ignored for `bin`/`oct`/`hex` |
| `calcPrec` | `float` · `64` · `128` · `256` | `float` | Arithmetic precision mode — see warning below |
| `scope` | tiddler title or `{a:1, b:2}` | — | Variable scope injected into the expression |
| `silence` | `yes` · `no` | `no` | Suppress expression error display |

#### When is `silence="yes"` useful?

`silence="yes"` suppresses errors that come from the *expression itself*.
Use it when an expression is intentionally incomplete or conditionally invalid:

- The expression depends on a TiddlyWiki variable (`<<myVar>>`) that is not
  yet defined — the widget would show an error until the variable is populated.
- A table where some cells have no value yet, causing their expressions to
  temporarily fail.
- A live-preview context where the expression is typed incrementally and is
  invalid most of the time.

The 200 ms debounce already covers momentary invalidity while typing.
`silence` covers cases where the expression remains invalid even after
stabilizing — and showing nothing is a better experience than a permanent
error message.

`silence` does **not** cover attribute errors (`notation="xyz"`, `calcPrec="512"`).  Those are static mistakes in the tiddler
source — they will never self-correct, so hiding them would only make them
harder to diagnose.

---

## Usage

### Basic

```
<$calc>1 + 2 * 3</$calc>
```

### Locale

```
<$calc locale="fr-FR">1234567.89</$calc>
```

Short aliases: `en` → `en-US`, `fr` → `fr-FR`.  
Any valid BCP-47 tag is accepted: `de-DE`, `ja-JP`, etc.

### Show modes

```
<$calc show="result">sqrt(2)</$calc>
<$calc show="formula">sqrt(2)</$calc>
<$calc show="full" mode="block">sqrt(x^2 + 1)</$calc>
```

### Notation

```
<$calc notation="scientific">0.00000012</$calc>
<$calc notation="engineering" locale="fr">1234567</$calc>
<$calc notation="fixed" precision="2">3.14159</$calc>
<$calc notation="bin">42</$calc>
<$calc notation="oct">42</$calc>
<$calc notation="hex">255</$calc>
```

For `bin`, `oct`, and `hex`: `locale` and `precision` are ignored. Non-integer values are truncated silently (`3.7` → `3`). Unit results produce an error — use `number(expr, unit)` to extract the numeric value first.

### Silence errors

```
<$calc silence="yes">bad expression</$calc>
```

Renders nothing on error instead of showing an error message.

### Calculation precision

```
<$calc calcPrec="64">1e13 + 1.23456789 - 1e13</$calc>
```

See the [precision and performance](#precision-and-performance) section for
when to use each mode.

### Variable scope — `scope` attribute

#### Tiddler mode

```
<$calc scope="MyVars">pi * r^2</$calc>
```

`MyVars` is a tiddler with one `name: expression` per line, evaluated in order:

```
r: 5
h: 10
vol: pi * r^2 * h
```

#### Inline mode

```
<$calc scope="{r: 3, h: 10}">pi * r^2 * h</$calc>
```

Key rules:
- valid mathjs identifiers only: `[a-zA-Z_$][a-zA-Z0-9_$]*`
- `r2` ✓ · `my_var` ✓ · `2r` ✗ · `my-var` ✗
- no quotes on keys: `{a:1}` not `{"a":1}`
- `math.unit(5 cm)` is auto-quoted — write it without inner quotes

### Units

```
<$calc>9.81 m/s^2 * 80 kg</$calc>
<$calc>460 V * 20 A * 30 days to kWh</$calc>
<$calc>100 degF to degC</$calc>
<$calc>5 cm + 2 m to inch</$calc>
```

### Scientific notation input

Standard `5e9`, `1.5e-3`, `2.5e+6` notation is fully supported.

> Do **not** write `5 * e9` — that means 5 times an undefined symbol `e9`.

---

## Reserved identifiers

mathjs pre-defines two single-letter constants that cannot be used as variable
names without silently overriding them:

| Identifier | mathjs meaning |
|---|---|
| `e` | Euler's number, 2.718281828… (also `ℯ` U+212F) |
| `i` | imaginary unit, √−1 |

Defining `e` or `i` in the `scope` shadows these constants for the entire
expression.  Use unambiguous names instead: `euler`, `base`, `idx`, `imag`, etc.

---

## Precision and performance

### Default: float

By default the widget uses native IEEE 754 `float64` — the standard JavaScript
`Number` type (~16 significant digits).  The formatter caps output at 12
decimal places, which already suppresses most float artefacts visible to
humans:

| Expression | Raw float | Displayed (12 dec.) |
|---|---|---|
| `0.1 + 0.2` | `0.30000000000000004` | `0.3` ✅ |
| `9.81 * 80` | `784.8000000000001` | `784.8` ✅ |

Use float for the vast majority of expressions.

### When to use BigNumber

Switch to a BigNumber precision mode only when float produces a **visibly
wrong result** that the default precision cap cannot fix:

| Situation | Example | Float result | BigNumber result |
|---|---|---|---|
| Catastrophic cancellation | `1e13 + 1.23456789 - 1e13` | `1.234375` ❌ | `1.23456789` ✅ |
| Subtraction residual | `0.3 - 0.1 - 0.1 - 0.1` | `-2.78e-17` ❌ | `0` ✅ |
| Integer > MAX_SAFE_INTEGER | `9007199254740993` | `9007199254740992` ❌ | `9007199254740993` ✅ |

### Calculation precision modes

| `calcPrec` | Engine | Significant digits | Typical cost vs float |
|---|---|---|---|
| `float` (default) | IEEE 754 | ~16 | 1× baseline |
| `64` | BigNumber | 64 | ~3–4× slower |
| `128` | BigNumber | 128 | ~5–6× slower |
| `256` | BigNumber | 256 | ~8–10× slower |

### Display vs internal precision

`calcPrec` controls internal accuracy. `precision` controls visible digits.
Raising `calcPrec` does **not** produce more visible digits — BigNumber only
reduces rounding errors in intermediate steps.

> **Note on BigNumber digit counts vs bits:**  
> `calcPrec="64"` means 64 *decimal significant digits* (~213 bits), not 64 bits.  
> `calcPrec="128"` is ~425 bits. Do not confuse with IEEE 754 bit widths.

### Display precision defaults

Math.js generic defaults cap output at 14 significant digits, with `auto`
switching to scientific notation below `1e-3` or above `1e5`.  The plugin uses
tighter, more readable defaults:

| Notation | Plugin default | Typical range in practice |
|---|---|---|
| `auto` | 6 sig. digits | — |
| `fixed` | 6 decimal places | 2–4 (general public) · 6–15 (technical) |
| `scientific` | 6 sig. digits | 3–5 (publications) · 6–8 (advanced scientific work) |
| `engineering` | 6 sig. digits | 3–4 (physical components rarely need more) |
| `bin` · `oct` · `hex` | — | `precision` ignored — math.js emits the exact digit count |

These defaults match common scientific/technical software conventions (e.g.
MATLAB, Wolfram Alpha display defaults) and are readable without being lossy
for the majority of use cases.  The `precision` attribute lets users override
them per widget.

### Performance thresholds (benchmarked on V8/Node.js)

A full page refresh evaluates all non-cached widgets sequentially on the main
thread.  The browser renders at 60 fps — each frame has 16 ms.  Anything beyond
that causes a visible stutter.

| `precision` | µs/eval (arithmetic) | µs/eval (`sin`/`cos`) | Widgets before jank |
|---|---|---|---|
| `float` | ~13 µs | ~14 µs | >1000 ✅ |
| `64` | ~66 µs | ~925 µs | ~240 (arith.) / ~17 (trig) |
| `128` | ~169 µs | ~1 957 µs | ~94 (arith.) / ~8 (trig) |
| `256` | ~89 µs | ~5 346 µs | ~180 (arith.) / ~3 (trig) |

The LRU cache means these costs apply only on first evaluation per unique
expression per tiddler change.

### Hard limit: trig functions at high precision

`sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh` are computed by
decimal.js internally.  They throw `[DecimalError] Precision limit exceeded` at
precision **≥ 510**.  The widget caps BigNumber options at 256, which is safely
within this limit.

---

## Installation

1. Copy the plugin folder into your TiddlyWiki plugins directory `./plugins`
2. Enable the plugin in `tiddlywiki.info` under `nikorion/math`
3. Reload the wiki

Or drag-and-drop the packed plugin tiddler into any open wiki.

---

## Links

- GitHub: <https://github.com/nikorion/TW-Math>
- Live demo: soon

---

## Technical notes

- Built on [Math.js](https://mathjs.org/) — float or BigNumber instance depending on `calcPrec`
- Uses TiddlyWiki widget lifecycle (`render` / `refresh`)
- No runtime dependencies beyond Math.js (KaTeX is optional)
- Designed for single-file wikis
- Cache key format: `["<tiddler-title>", "<calcPrec>", "<scope-attr>", "<expr>"]`

---

## Limitations

- Not a spreadsheet — no dependency graph between tiddlers
- No reactive variable propagation across widgets
- Sandbox is heuristic, not a secure VM
- KaTeX output covers common cases; advanced LaTeX (`\color`, `\align`, `\underbrace`) requires writing raw LaTeX via `<$katex />`

---

## Roadmap

- improved unit formatting
- LaTeX source output mode
- stricter sandbox
- performance profiling tools

---

## Version history

### v0.2.0 — 2026-06-12

Simplified API: `show` and `mode` replace `render`; input is now EN-only; all
output passes through KaTeX (with plain-text fallback). New `show="full"` mode
renders formula and result together. `notation` replaces `scientific` (and gains
`"bin"`, `"oct"`, `"hex"` for integer-base output). `scope` replaces `data`.
`calcPrec` replaces `precision` for calculation precision; `precision` is now
the display digit count.

### v0.1.0 — 2026-06-06

Initial public release.  Establishes the plugin structure and evaluation
pipeline.  All features are experimental and subject to breaking changes.

---

## Credits

Inspired by the original [tiddly-mathjs](https://github.com/mklauber/tiddly-mathjs)
by mklauber.  The TiddlyWiki integration patterns and overall structure derive
from that work.

Mathematical evaluation by [Math.js](https://github.com/josdejong/mathjs),
created by Jos de Jong and the Math.js community.

Icon from [SVG Repo](https://www.svgrepo.com/svg/228720/calculating-maths) —
see SVG Repo terms of use.

Developed with assistance from OpenAI ChatGPT and Anthropic Claude for code
review, refactoring, and documentation.

---

## License

MIT License — see `LICENSE`  
Includes Math.js (Apache 2.0)
