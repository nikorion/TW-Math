/*\
title: $:/plugins/nikorion/math/modules/format.js
type: application/javascript
module-type: library
\*/

/*
 * format.js — result formatting 🎨
 *
 * Converts a mathjs evaluation result into a formatted display string,
 * and provides utilities to convert results and formulas into KaTeX-ready
 * LaTeX strings.
 *
 * Works with both plain JS Number results (float / calcPrec="float") and
 * mathjs BigNumber results (calcPrec="64"|"128"|"256") — Intl.NumberFormat
 * coerces both to a native Number internally.
 *
 * ── Notation modes ────────────────────────────────────────────────────
 *
 * Decimal / scientific family — decimal-separator-aware, precision-controlled:
 *
 *   "auto"        Widget decides: scientific for |x| < 1e-3 or |x| >= 1e4 (> 4 sig. figs.),
 *                 decimal otherwise (ISO 80000-1).  Precision = significant digits (default 6).
 *
 *   "fixed"       Always decimal notation.
 *                 Precision = decimal places after the point (default 6).
 *                 Example: precision=2 → "3.14"
 *
 *   "scientific"  Always scientific notation.
 *                 Precision = significant digits in the mantissa (default 6).
 *                 Example: precision=3 → "3.142 \times 10^{0}"
 *
 *   "engineering" Engineering notation (exponent multiple of 3).
 *                 Precision = significant digits (default 6).
 *
 * Integer-base family — decimal-ignored, precision-ignored:
 *
 *   "bin"         Binary, prefixed "0b".   Example: 42 → "0b101010"
 *   "oct"         Octal,  prefixed "0o".   Example: 42 → "0o52"
 *   "hex"         Hexadecimal, prefixed "0x".  Example: 255 → "0xff"
 *
 *   Rules for bin/oct/hex:
 *   • decimal and precision attributes are ignored.
 *   • BigNumber results are converted via toNumber() before formatting.
 *   • Non-integer values are truncated silently by math.js (3.7 → 3 in bin).
 *   • Negative values are accepted: -42 → "-0b101010".
 *   • Unit results produce an error (base conversion of a physical quantity
 *     is undefined).
 *   • KaTeX output uses \texttt{} for monospace rendering.
 *
 * ── Display precision vs. calculation precision ───────────────────────
 * The `calcPrec` attribute controls internal BigNumber accuracy.
 * The `precision` attribute here controls how many digits are *displayed*.
 * They are completely independent.
 * precision is ignored for bin/oct/hex — math.js always emits the exact
 * minimal digit count needed to represent the value.
 *
 * ── Math.js generic defaults (for reference) ─────────────────────────
 * math.js out-of-the-box uses 14 significant digits for all notations,
 * and "auto" switches to scientific below 1e-3 or above 1e5.
 * This plugin uses 6 significant digits and follows ISO 80000-1 thresholds:
 * scientific for |x| < 1e-3 or |x| >= 1e4 (more than 4 significant figures).
 * Users can override per widget with the `precision` attribute.
 *
 * Note on BigNumber digit counts: `precision="64"` means 64 *decimal*
 * significant digits (~213 bits), not 64 bits.  Do not confuse with
 * IEEE 754 bit widths.
 *
 * ── Unit formatting strategy ─────────────────────────────────────────
 * mathjs.toString() on a Unit always produces the "best" string.
 * We parse that string, reformat the numeric part with Intl, and reattach
 * the unit symbol.  Auto-reprefixing is reverted for single-unit results
 * without an explicit "to" conversion.
 *
 * Exported:
 *   format(result, locale, options)            → plain string (for text fallback)
 *   formatResultKatex(result, locale, options) → LaTeX string
 *   formatKatexFR(tex, locale)                 → LaTeX string (formula post-processing)
 *   clampPrecision(p, notation)                → integer in safe display bounds
 *   BASE_NOTATIONS                             → Set{"bin","oct","hex"}
 *   NOTATION_DEFAULTS                          → { auto, fixed, scientific, engineering }
 *   LOCALE_ALIASES                             → { en, fr }
 *
 *   options {
 *     notation  {string}  "auto" | "fixed" | "scientific" | "engineering"
 *                       | "bin" | "oct" | "hex"
 *     precision {number}  digits (meaning depends on notation mode; ignored for bin/oct/hex)
 *   }
 */

(function () {
  "use strict";

  const math = require("$:/plugins/nikorion/math/modules/math.min.js");
  const lang = require("$:/plugins/nikorion/math/modules/lang.js");

  const NNBSP = " "; // NARROW NO-BREAK SPACE (U+202F) — ISO 80000-1 thin space around ×

  // ── Unicode superscript map for scientific exponents ─────────────────
  const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³",
                "4": "⁴", "5": "⁵", "6": "⁶",
                "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
  function toSup(str) { return String(str).split("").map(function(c) { return SUP[c] || c; }).join(""); }

  // True for any locale that uses comma as decimal separator (fr-FR, de-DE, es-ES…).
  function isCommaDecimal(locale) {
    return new Intl.NumberFormat(locale).format(1.1).includes(",");
  }

  // Remove trailing zeros (and trailing dot) from a mantissa string.
  // Only used when precision is not explicitly set by the user.
  // "1.4140" → "1.414"  |  "1.0000" → "1"  |  "1." → "1"
  function stripTrailingZerosMantissa(m) {
    if (m.indexOf(".") === -1) return m;
    return m.replace(/\.?0+$/, "");
  }

  // ── Integer-base notation set ─────────────────────────────────────────
  // bin/oct/hex bypass the decimal setting, precision, and Intl formatting entirely.
  const BASE_NOTATIONS = new Set(["bin", "oct", "hex"]);

  // ── Default precision per notation mode ───────────────────────────────
  // All decimal/scientific modes default to 6: readable without being lossy
  // for most sci/tech uses.  math.js generic default is 14 (masks IEEE 754
  // noise but verbose).  Users override via the `precision` attribute.
  // bin/oct/hex have no meaningful default — math.js always emits the exact
  // minimal digit count for the value, so precision is left undefined.
  const NOTATION_DEFAULTS = {
    auto:        6,
    fixed:       6,
    scientific:  6,
    engineering: 6,
  };

  exports.BASE_NOTATIONS    = BASE_NOTATIONS;
  exports.NOTATION_DEFAULTS = NOTATION_DEFAULTS;

  // Clamp display precision to safe bounds. 🛡️
  //   • bin/oct/hex → precision is unused; return undefined (caller ignores it).
  //   • non-numeric (NaN, undefined) → notation default
  //   • upper bound 100: Intl.NumberFormat caps maximumFractionDigits at 100
  //   • lower bound 1 for scientific/engineering (significant digits) AND
  //     for auto (which can route to toExponential(p-1), invalid for p=0);
  //     0 allowed for fixed (integer display).
  exports.clampPrecision = function clampPrecision(p, notation) {
    if (BASE_NOTATIONS.has(notation)) return undefined;
    if (!Number.isFinite(p)) return NOTATION_DEFAULTS[notation] ?? 6;
    const min = notation === "fixed" ? 0 : 1;
    return Math.min(100, Math.max(min, Math.trunc(p)));
  };

  // ─────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────

  // ── Base-conversion helper (bin / oct / hex) ──────────────────────────
  // Accepts a plain JS number or a mathjs BigNumber.
  // Returns the formatted string ("0b101010", "-0o52", "0xff", …).
  // Non-integer values are truncated explicitly before formatting — mathjs
  // does not guarantee integer conversion for float inputs on all platforms.
  // Throws a descriptive Error if the result is a Unit — base conversion
  // of a physical quantity is undefined.
  function formatBase(result, notation) {
    if (result?.units) {
      throw new Error(
        lang.getString("Errors/NotationWithUnit").replace("%1", notation)
      );
    }
    const num = typeof result === "number"   ? result
              : result?.isBigNumber          ? result.toNumber()
              : null;
    if (num === null) {
      throw new Error(
        lang.getString("Errors/NotationNumeric").replace("%1", notation)
      );
    }
    // Truncate to integer before base conversion. Math.trunc preserves sign;
    // math.format handles the prefix ("0b", "0o", "0x") and the minus sign.
    return math.format(Math.trunc(num), { notation });
  }

  // Intl.NumberFormat wrapper — grouping and decimal separator. 🌐
  // Replaces any space with narrow no-break space (U+202F) per ISO 80000.
  // Used by notation="fixed": precision = decimal places after the point.
  function intlFormat(num, locale, fractionDigits) {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: fractionDigits,
    }).formatToParts(num).map(function(p) {
      return p.type === "group" ? NNBSP : p.value;
    }).join("");
  }

  // Significant-figures variant — used by notation="auto" in decimal range.
  // Consistent with scientific/engineering: precision = significant digits.
  // When precisionExplicit, sets minimum = maximum so trailing zeros are kept.
  function intlFormatSigFigs(num, locale, precision, precisionExplicit) {
    var opts = precisionExplicit
      ? { minimumSignificantDigits: precision, maximumSignificantDigits: precision }
      : { maximumSignificantDigits: precision };
    return new Intl.NumberFormat(locale, opts).formatToParts(num).map(function(p) {
      return p.type === "group" ? NNBSP : p.value;
    }).join("");
  }

  // Engineering notation via mathjs — returns "1.4145e+6" style. ⚙️
  function engineeringRaw(num, precision) {
    return math.format(num, { notation: "engineering", precision });
  }

  // Split "1.4145e+6" → { mantissa: "1.4145", exp: 6 }
  function splitSci(str) {
    const [mantissa, expStr] = str.split(/e/i);
    return { mantissa, exp: parseInt(expStr, 10) };
  }

  // ISO 80000-1 plain-text scientific notation: mantissa NNBSP× NNBSP 10^exp.
  // Uses Unicode superscripts for the exponent (e.g. 10⁻⁶ instead of 10^-6).
  function sciStr(mantissa, exp, isFR) {
    const m = isFR ? mantissa.replace(".", ",") : mantissa;
    if (exp === 0) return m;
    return m + NNBSP + "×" + NNBSP + "10" + toSup(exp);
  }

  // Format a plain number to a plain string (text fallback). 🔢
  function formatNumber(num, locale, notation, precision, precisionExplicit) {
    const abs = Math.abs(num);
    const isFR = isCommaDecimal(locale);
    function clean(m) { return precisionExplicit ? m : stripTrailingZerosMantissa(m); }

    switch (notation) {
      case "scientific": {
        const raw = num.toExponential(precision - 1); // "1.4140e-6"
        const { mantissa, exp } = splitSci(raw);
        return sciStr(clean(mantissa), exp, isFR);
      }

      case "engineering": {
        const raw = engineeringRaw(num, precision);
        const { mantissa, exp } = splitSci(raw);
        return sciStr(clean(mantissa), exp, isFR);
      }

      case "auto":
        if (num !== 0 && (abs < 1e-3 || abs >= 1e4)) {
          const raw = num.toExponential(precision - 1);
          const { mantissa, exp } = splitSci(raw);
          return sciStr(clean(mantissa), exp, isFR);
        }
        return intlFormatSigFigs(num, locale, precision, precisionExplicit);

      case "fixed":
      default:
        return intlFormat(num, locale, precision);
    }
  }

  // ── Temperature unit display names ────────────────────────────────────
  // mathjs uses "degC", "degF", "degR" internally; map them to typographic
  // symbols for display.  kelvin is already "K" in mathjs output.
  const TEMP_UNIT_DISPLAY = { degC: "°C", degF: "°F", degR: "°R" };

  // Split a mathjs Unit result into numeric value + display unit. 📐
  // Returns null if result is not a Unit.
  // Returns { raw } when the numeric part cannot be isolated (e.g. a
  // complex-valued unit) — callers fall back to the raw mathjs string.
  function splitUnit(result) {
    if (!result?.units) return null;

    const str   = result.toString();
    const match = str.match(/^(-?[\d.]+(?:e[+-]?\d+)?)\s*(.*)$/i);
    if (!match) return { raw: str };

    let num         = parseFloat(match[1]);
    let displayUnit = match[2].trim();

    // Revert auto-reprefixing for single-unit results without "to". 🔙
    if (!result.fixPrefix && result.units.length === 1) {
      const u        = result.units[0];
      const origUnit = u.prefix.name + u.unit.name + (u.power !== 1 ? `^${u.power}` : "");
      try {
        num         = result.toNumber(origUnit);
        displayUnit = origUnit;
      } catch { /* keep mathjs output */ }
    }

    // Map mathjs internal unit names to typographic display symbols. 🌡️
    displayUnit = TEMP_UNIT_DISPLAY[displayUnit] ?? displayUnit;

    return { num, displayUnit };
  }

  // Format a mathjs Unit result to a plain string. 📐
  // Returns null if result is not a Unit.
  function formatUnit(result, locale, notation, precision, precisionExplicit) {
    const parts = splitUnit(result);
    if (!parts)    return null;
    if (parts.raw) return parts.raw;

    const formatted = formatNumber(parts.num, locale, notation, precision, precisionExplicit);
    return parts.displayUnit ? `${formatted}\u202F${parts.displayUnit}` : formatted;
  }

  // ── Complex number formatting ─────────────────────────────────────────
  // Formats a mathjs Complex result as "a + bi" (or "a − bi" for negative
  // imaginary parts), applying locale-aware formatting to both parts.
  // Pure real or pure imaginary results are simplified accordingly.
  function formatComplex(result, locale, notation, precision, precisionExplicit) {
    const re = formatNumber(result.re, locale, notation, precision, precisionExplicit);
    const im = Math.abs(result.im);
    const imStr = formatNumber(im, locale, notation, precision, precisionExplicit);
    if (result.im === 0) return re;
    if (result.re === 0) return result.im < 0 ? `\u2212${imStr}i` : `${imStr}i`;
    const sign = result.im < 0 ? " \u2212 " : " + ";
    return `${re}${sign}${imStr}i`;
  }

  function formatComplexKatex(result, locale, notation, precision, precisionExplicit) {
    const re = numberToKatex(result.re, locale, notation, precision, precisionExplicit);
    const im = Math.abs(result.im);
    const imTex = numberToKatex(im, locale, notation, precision, precisionExplicit);
    if (result.im === 0) return re;
    if (result.re === 0) return result.im < 0 ? `-${imTex}i` : `${imTex}i`;
    const sign = result.im < 0 ? " - " : " + ";
    return `${re}${sign}${imTex}i`;
  }

  // ─────────────────────────────────────────────────────────────────────
  // format (exported) — plain text output ✨
  // ─────────────────────────────────────────────────────────────────────
  exports.format = function format(result, locale, options = {}) {
    const notation          = options.notation          ?? "auto";
    const precisionExplicit = options.precisionExplicit ?? false;

    // ── Integer-base modes: decimal and precision are bypassed entirely ──
    if (BASE_NOTATIONS.has(notation)) return formatBase(result, notation);

    const precision = exports.clampPrecision(options.precision ?? NaN, notation);

    if (typeof result === "number")  return formatNumber(result, locale, notation, precision, precisionExplicit);
    if (result?.isBigNumber)         return formatNumber(result.toNumber(), locale, notation, precision, precisionExplicit);
    if (result?.isComplex)           return formatComplex(result, locale, notation, precision, precisionExplicit);
    const unitStr = formatUnit(result, locale, notation, precision, precisionExplicit);
    if (unitStr !== null)            return unitStr;
    return math.format(result, { notation: "fixed", precision: 12 }); // fallback
  };

  // ─────────────────────────────────────────────────────────────────────
  // formatResultKatex (exported) — numeric result → LaTeX string 🔢
  //
  // Converts a formatted numeric result into a KaTeX-ready LaTeX string.
  //
  // Transformations:
  //   bin/oct/hex:        "0b101010"            → "\texttt{0b101010}"
  //   scientific EN:  "1.4140e-6"           → "1.4140 \times 10^{-6}"
  //   scientific FR:  "1,4140 × 10^-6"      → "1{,}4140 \times 10^{-6}"
  //   engineering EN: "1.4145e+6"           → "1.4145 \times 10^{6}"
  //   engineering FR: "1,4145e+6"           → "1{,}4145 \times 10^{6}"
  //   decimal EN:     "1,414.5"             → "1\,414.5"
  //   decimal FR:     "1 414,5"             → "1\,414{,}5"
  //   unit EN:        "9.81 m / s^2"        → "9.81\,\text{m / s^2}"
  //   unit FR:        "9,81 m / s^2"        → "9{,}81\,\text{m / s^2}"
  // ─────────────────────────────────────────────────────────────────────
  exports.formatResultKatex = function formatResultKatex(result, locale, options = {}) {
    const notation          = options.notation          ?? "auto";
    const precisionExplicit = options.precisionExplicit ?? false;

    // ── Integer-base modes: decimal and precision are bypassed entirely ──
    // formatBase throws a descriptive Error for Unit results.
    // \texttt{} gives monospace rendering (prefix "0b"/"0o"/"0x" reads better).
    if (BASE_NOTATIONS.has(notation)) {
      return `\\texttt{${formatBase(result, notation)}}`;
    }

    const precision = exports.clampPrecision(options.precision ?? NaN, notation);

    // ── Complex numbers ────────────────────────────────────────────────
    if (result?.isComplex) return formatComplexKatex(result, locale, notation, precision, precisionExplicit);

    // ── Units: number and unit obtained separately via splitUnit ──────
    // (never re-parse a formatted string — locale separators make that
    // ambiguous and the old lazy regex split "9.81" into "9" + ".81").
    if (result?.units) {
      const parts = splitUnit(result);
      if (parts.raw) return `\\text{${parts.raw}}`;
      const numTex  = numberToKatex(parts.num, locale, notation, precision, precisionExplicit);
      const unitTex = parts.displayUnit ? `\\,\\text{${parts.displayUnit}}` : "";
      return numTex + unitTex;
    }

    // ── Numbers ────────────────────────────────────────────────────────
    const num = typeof result === "number" ? result
              : result?.isBigNumber        ? result.toNumber()
              : null;

    if (num !== null) return numberToKatex(num, locale, notation, precision, precisionExplicit);

    // ── Fallback: matrices, fractions, etc. ───────────────────────────
    return `\\text{${exports.format(result, locale, options)}}`;
  };

  // Format a plain number to a KaTeX-ready LaTeX string. 🔬
  // Same notation rules as formatNumber, but LaTeX output.
  function numberToKatex(num, locale, notation, precision, precisionExplicit) {
    const isFR = isCommaDecimal(locale);
    const abs  = Math.abs(num);
    const useSci = notation === "scientific"
                || notation === "engineering"
                || (notation === "auto" && num !== 0 && (abs < 1e-3 || abs >= 1e4));

    if (useSci) {
      const raw = notation === "engineering"
        ? engineeringRaw(num, precision)
        : num.toExponential(precision - 1);
      const { mantissa, exp } = splitSci(raw);
      const m = precisionExplicit ? mantissa : stripTrailingZerosMantissa(mantissa);
      const mantissaTex = isFR ? m.replace(".", "{,}") : m;
      if (exp === 0) return mantissaTex;
      return `${mantissaTex} \\times 10^{${exp}}`;
    }

    // Decimal: use Intl then convert separators to LaTeX. 🔢
    // auto → significant digits (ISO 80000-1); fixed → decimal places.
    const plain = notation === "fixed"
      ? intlFormat(num, locale, precision)
      : intlFormatSigFigs(num, locale, precision, precisionExplicit);
    return numericToKatex(plain, isFR);
  }

  // Convert a formatted decimal string to LaTeX. 🔄
  //   EN "1 414.5"  → "1\,414.5"      (NNBSP = thousands sep → \,)
  //   FR "1 414,5"  → "1\,414{,}5"    (NNBSP = thousands, comma = decimal)
  // Both modes produce NNBSP for grouping (intlFormat uses formatToParts).
  function numericToKatex(plain, isFR) {
    if (isFR) {
      // Decimal comma FIRST: the "\," inserted for thousands spaces
      // contains a comma that would otherwise match /,(?=\d)/.
      return plain
        .replace(/,(?=\d)/g, "{,}")              // FR decimal comma → {,}
        .replace(/[\u202F\u00A0]/g, "\\,");      // NNBSP/NBSP thousands → \,
    }
    // EN: intlFormat now outputs NNBSP (not comma) for thousands grouping.
    return plain.replace(/[\u202F\u00A0]/g, "\\,");
  }


  // formatKatexFR — formula number formatting for KaTeX output 🔢
  //
  // Post-processes a toTex() string so that numbers in formulas render
  // consistently with show="result" (which uses formatResultKatex).
  //
  // toTex() leaves integers ungrouped and uses "." as decimal separator.
  // This function aligns the formula rendering with the result rendering:
  //
  //   FR decimal point → {,}:   3.14   →  3{,}14   (no extra KaTeX comma spacing)
  //   Thousands grouping:        1000   →  1\,000   (all locales, ISO 80000-1)
  exports.formatKatexFR = function formatKatexFR(tex, locale) {
    const isFR = isCommaDecimal(locale);
    let s = tex;

    // Step 0: scientific notation — math.js toTex() converts large/small numbers
    // to e.g. "5 \cdot 10^{+7}"; ISO 80000-1 requires \times for powers-of-10,
    // and the leading '+' on positive exponents is dropped.
    s = s.replace(/\\cdot\s*10\^\{([+-]?\d+)\}/g, function(_, exp) {
      return '\\times 10^{' + exp.replace(/^\+/, '') + '}';
    });

    if (isFR) {
      // Step 1 — decimal point → {,} (KaTeX form: no extra spacing around comma).
      s = s.replace(/(\d)\.(\d)/g, "$1{,}$2");
    }

    // Step 2 — thousands grouping with \, for integers ≥ 1 000 (all locales).
    // After FR step 1, decimal numbers look like "3{,}14" — the "{" stops the
    // regex before the fractional part, so only the integer part gets grouped.
    s = s.replace(/\d[\d,]*/g, (numStr) => {
      const parts   = numStr.split(",");
      const intPart = parts[0];
      if (intPart.length < 4) return numStr;
      parts[0] = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "\\,");
      return parts.join(",");
    });

    return s;
  };

})();