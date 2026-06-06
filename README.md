# 🧮 TiddlyMathJS Calc Widget

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

1. Copy plugin into TiddlyWiki plugins folder
2. Enable plugin
3. Reload wiki

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

## 📜 License

MIT License  
Includes Math.js (Apache 2.0)
