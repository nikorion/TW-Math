/*\
title: $:/plugins/nikorion/math/modules/format.js
type: application/javascript
module-type: library
\*/

/*
 * format.js — result formatting 🎨
 *
 * Converts a mathjs evaluation result into a locale-aware display string,
 * and provides utilities to convert results and formulas into KaTeX-ready
 * LaTeX strings.
 *
 * Works with both plain JS Number results (float / calcPrec="float") and
 * mathjs BigNumber results (calcPrec="64"|"128"|"256") — Intl.NumberFormat
 * coerces both to a native Number internally.
 *
 * ── Notation modes ────────────────────────────────────────────────────
 *
 * Decimal / scientific family — locale-aware, precision-controlled:
 *
 *   "auto"        Widget decides: scientific for |x| < 1e-6 or |x| > 1e12,
 *                 decimal otherwise.  Precision = max decimal places (default 6).
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
 * Integer-base family — locale-ignored, precision-ignored:
 *
 *   "bin"         Binary, prefixed "0b".   Example: 42 → "0b101010"
 *   "oct"         Octal,  prefixed "0o".   Example: 42 → "0o52"
 *   "hex"         Hexadecimal, prefixed "0x".  Example: 255 → "0xff"
 *
 *   Rules for bin/oct/hex:
 *   • locale and precision attributes are ignored.
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
 * That matches IEEE 754 double precision but is verbose for a display widget.
 * This plugin uses 6 significant digits across all modes — readable and
 * sufficient for most scientific/technical uses, matching common software
 * conventions (MATLAB, Wolfram Alpha, etc.).  Users can override per widget
 * with the `precision` attribute.
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

  const math = require("$:/plugins/nikorion/math/modules/math.js");

  // ── Integer-base notation set ─────────────────────────────────────────
  // bin/oct/hex bypass locale, precision, and Intl formatting entirely.
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
  exports.LOCALE_ALIASES    = { en: "en-US", fr: "fr-FR" };

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
  // Throws a descriptive Error if the result is a Unit — base conversion
  // of a physical quantity is undefined.
  function formatBase(result, notation) {
    if (result?.units) {
      throw new Error(
        `notation="${notation}" cannot be used with a unit result — ` +
        `extract the numeric value first with number(expr, unit)`
      );
    }
    const num = typeof result === "number"   ? result
              : result?.isBigNumber          ? result.toNumber()
              : null;
    if (num === null) {
      throw new Error(
        `notation="${notation}" requires a numeric result`
      );
    }
    return math.format(num, { notation });
  }

  // Intl.NumberFormat wrapper — locale-aware grouping and decimal. 🌐
  // Replaces any space with narrow no-break space (U+202F) per ISO 80000.
  function intlFormat(num, locale, fractionDigits) {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: fractionDigits,
    }).format(num).replace(/ /g, "\u202F");
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

  // Format a plain number to a plain string (text fallback). 🔢
  function formatNumber(num, locale, notation, precision) {
    const abs = Math.abs(num);

    switch (notation) {
      case "scientific": {
        const raw = num.toExponential(precision - 1); // "1.4140e-6"
        if (locale === "fr-FR") {
          const { mantissa, exp } = splitSci(raw);
          return `${mantissa.replace(".", ",")} \u00D7 10^${exp}`;
        }
        return raw;
      }

      case "engineering": {
        const raw = engineeringRaw(num, precision);
        return locale === "fr-FR" ? raw.replace(".", ",") : raw;
      }

      case "auto":
        if (num !== 0 && (abs < 1e-6 || abs > 1e12)) {
          const raw = num.toExponential(precision - 1);
          if (locale === "fr-FR") {
            const { mantissa, exp } = splitSci(raw);
            return `${mantissa.replace(".", ",")} \u00D7 10^${exp}`;
          }
          return raw;
        }
        return intlFormat(num, locale, precision);

      case "fixed":
      default:
        return intlFormat(num, locale, precision);
    }
  }

  // Split a mathjs Unit result into numeric value + display unit. 📐
  // Returns null if result is not a Unit.
  // Returns { raw } when the numeric part cannot be isolated (e.g. a
  // complex-valued unit) — callers fall back to the raw mathjs string.
  function splitUnit(result) {
    if (!result?.units) return null;

    const str   = result.toString();
    const match = str.match(/^(-?[\d.]+(?:e[+\-]?\d+)?)\s*(.*)$/i);
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

    return { num, displayUnit };
  }

  // Format a mathjs Unit result to a plain string. 📐
  // Returns null if result is not a Unit.
  function formatUnit(result, locale, notation, precision) {
    const parts = splitUnit(result);
    if (!parts)    return null;
    if (parts.raw) return parts.raw;

    const formatted = formatNumber(parts.num, locale, notation, precision);
    return parts.displayUnit ? `${formatted}\u202F${parts.displayUnit}` : formatted;
  }

  // ─────────────────────────────────────────────────────────────────────
  // format (exported) — plain text output ✨
  // ─────────────────────────────────────────────────────────────────────
  exports.format = function format(result, locale, options = {}) {
    const notation  = options.notation  ?? "auto";

    // ── Integer-base modes: locale and precision are bypassed entirely ──
    if (BASE_NOTATIONS.has(notation)) return formatBase(result, notation);

    const precision = exports.clampPrecision(options.precision ?? NaN, notation);

    if (typeof result === "number")  return formatNumber(result, locale, notation, precision);
    if (result?.isBigNumber)         return formatNumber(result.toNumber(), locale, notation, precision);
    const unitStr = formatUnit(result, locale, notation, precision);
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
    const notation  = options.notation  ?? "auto";

    // ── Integer-base modes: locale and precision are bypassed entirely ──
    // formatBase throws a descriptive Error for Unit results.
    // \texttt{} gives monospace rendering (prefix "0b"/"0o"/"0x" reads better).
    if (BASE_NOTATIONS.has(notation)) {
      return `\\texttt{${formatBase(result, notation)}}`;
    }

    const precision = exports.clampPrecision(options.precision ?? NaN, notation);

    // ── Units: number and unit obtained separately via splitUnit ──────
    // (never re-parse a formatted string — locale separators make that
    // ambiguous and the old lazy regex split "9.81" into "9" + ".81").
    if (result?.units) {
      const parts = splitUnit(result);
      if (parts.raw) return `\\text{${parts.raw}}`;
      const numTex  = numberToKatex(parts.num, locale, notation, precision);
      const unitTex = parts.displayUnit ? `\\,\\text{${parts.displayUnit}}` : "";
      return numTex + unitTex;
    }

    // ── Numbers ────────────────────────────────────────────────────────
    const num = typeof result === "number" ? result
              : result?.isBigNumber        ? result.toNumber()
              : null;

    if (num !== null) return numberToKatex(num, locale, notation, precision);

    // ── Fallback: matrices, fractions, etc. ───────────────────────────
    return `\\text{${exports.format(result, locale, options)}}`;
  };

  // Format a plain number to a KaTeX-ready LaTeX string. 🔬
  // Same notation rules as formatNumber, but LaTeX output.
  function numberToKatex(num, locale, notation, precision) {
    const isFR = locale === "fr-FR";
    const abs  = Math.abs(num);
    const useSci = notation === "scientific"
                || notation === "engineering"
                || (notation === "auto" && num !== 0 && (abs < 1e-6 || abs > 1e12));

    if (useSci) {
      const raw = notation === "engineering"
        ? engineeringRaw(num, precision)
        : num.toExponential(precision - 1);
      const { mantissa, exp } = splitSci(raw);
      const mantissaTex = isFR
        ? mantissa.replace(".", "{,}")
        : mantissa;
      return `${mantissaTex} \\times 10^{${exp}}`;
    }

    // Decimal: use Intl then convert separators to LaTeX. 🔢
    const plain = intlFormat(num, locale, precision);
    return numericToKatex(plain, isFR);
  }

  // Convert a formatted decimal string to LaTeX. 🔄
  //   EN "1,414.5"  → "1\,414.5"       (comma = thousands sep → \,)
  //   FR "1 414,5"  → "1\,414{,}5"     (space = thousands sep → \,, comma = decimal → {,})
  function numericToKatex(plain, isFR) {
    if (isFR) {
      // ⚠️ Decimal comma FIRST: the "\," inserted for thousands spaces
      // contains a comma that would otherwise match /,(?=\d)/ and become
      // "\{,}" ("1 414,5" → "1\{,}414{,}5" instead of "1\,414{,}5").
      return plain
        .replace(/,(?=\d)/g, "{,}")          // decimal comma → {,}
        .replace(/[\u202F\u00A0 ]/g, "\\,"); // thousands spaces → \,
    }
    // EN: comma = thousands sep → \,
    return plain.replace(/,(?=\d{3})/g, "\\,");
  }


  // formatKatexFR — formula post-processing 🇫🇷
  //
  // Post-processes a toTex() string for French typographic style.
  // Only active for "fr" / "fr-FR".
  //
  // toTex() converts numbers ≥ 100 000 to scientific notation automatically,
  // so grouping applies to integers ≥ 1 000 that toTex() leaves as plain digits.
  //
  //   Decimal point → comma:  3.14   →  3,14
  //   Thousands grouping:     1000   →  1\,000   99999 → 99\,999
  exports.formatKatexFR = function formatKatexFR(tex, locale) {
    if (locale !== "fr" && locale !== "fr-FR") return tex;

    // Step 1 — decimal point → decimal comma (between digits only).
    let s = tex.replace(/(\d)\.(\d)/g, "$1,$2");

    // Step 2 — thousands grouping with \, for integers ≥ 1 000.
    // toTex() handles ≥ 6 digits via scientific notation.
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