# 🧮 Tiddlywiki Math.js Widget

![Status](https://img.shields.io/badge/status-experimental-orange)

🚧 **Experimental / Development version**

This project is currently under active development and is not production-ready.

Expect breaking changes, unstable behavior, and ongoing API adjustments.

---

## 📌 Overview

A lightweight TiddlyWiki widget integrating Math.js for inline expression evaluation with:

- FR/EN locale-aware parsing
- configurable numeric formatting
- unit-aware output
- caching layer for performance
- sandboxed evaluation
- scientific notation control

---

## ⚙️ Features

### 🌍 Locale-aware parsing

Supports:

- 1.2 + 3.4 (EN)
- 1,2 + 3,4 (FR)
- 1,2 × 10^3 (FR style)

Auto-detection enabled.

---

### 🧮 Math.js integration

Supports:

- arithmetic
- functions (sin, sqrt, log, etc.)
- fractions
- units (basic support)

---

### 📐 Scientific notation control

Example:

```
<$calc scientific="auto">0.00000012</$calc>
```

Modes:
- auto
- always
- never

---

### 🇫🇷 French typographic formatting

- thin non-breaking spaces
- 1 000 000 formatting
- × 10^n scientific style
- decimal comma support

---

### ⚡ Performance

- LRU cache for evaluated expressions
- lazy DOM evaluation
- optimized refresh cycle for TiddlyWiki

---

### 🔒 Safety

- basic sandboxing of expressions
- function whitelist
- prevents unsafe JS access

---

## 🧩 Usage

### Basic

```
<$calc>1 + 2 * 3</$calc>
```

---

### Locale control

```
<$calc in="auto">1,2 × 10^3</$calc>
```

Options:
- auto
- fr-FR
- en-US

---

### Output control

```
<$calc out="fr-FR">1234.56</$calc>
```

---

### Scientific mode

```
<$calc scientific="always">0.00000012</$calc>
```

---

## 📦 Installation

1. Copy plugin folder into TiddlyWiki plugins folder `./plugins`
2. Enable plugin in `tiddlywiki.info` under `nikorion/math`
3. Reload wiki

Or 

1. Drag and Drop the packed plugin

---

## 🔗 Links

- GitHub repository : https://github.com/nikorion/TW-Math
- Live demo : soon

---

## 🧠 Technical notes

- Built on Math.js
- Uses TiddlyWiki widget lifecycle
- No dependencies beyond Math.js
- Designed for single-file wikis

---

## ⚠️ Limitations

- Not a spreadsheet engine
- No dependency graph
- Sandbox is heuristic
- Locale detection is probabilistic

---

## 🚧 Roadmap

- improved unit formatting
- stricter sandbox mode
- LaTeX output option
- performance profiling tools

---

## 🕰️ Version History

### v0.1.0 (Experimental)

2026 06 06

Initial public release and repository creation.

This version represents the first implementation of the plugin and serves as the foundation for future development.


---

## 🙏 Credits

This plugin is based on the work of mklauber and the original Tiddly Math.js plugin:

* https://github.com/mklauber/tiddly-mathjs

While this project has evolved beyond the original implementation, its initial structure, TiddlyWiki integration patterns, and overall approach were inspired by that work.

Mathematical expression parsing and evaluation are provided by Math.js, created by Jos de Jong and maintained by the Math.js community:

* https://github.com/josdejong/mathjs

Many thanks to Jos de Jong and all Math.js contributors for their continued work on one of the most comprehensive mathematics libraries available for JavaScript.

### Icon

- Source: https://www.svgrepo.com/svg/228720/calculating-maths
- Provider: SVG Repo (https://www.svgrepo.com/)
- License: see SVG Repo terms of use

---

## 🤖 Development Notes

This project was developed with the assistance of OpenAI's ChatGPT for code review, technical discussions, refactoring ideas, and documentation support.

---

## 📜 License

MIT License  
Includes Math.js (Apache 2.0)
