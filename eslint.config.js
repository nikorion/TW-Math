import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "plugins/nikorion/math/modules/math.js",
      "node_modules/**",
      "dist/**",
      "docs/**",
      "wiki/**",
    ],
  },
  {
    files: ["plugins/nikorion/math/modules/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: {
        ...globals.browser,
        $tw:     "readonly",
        require: "readonly",
        exports: "writable",
        module:  "readonly",
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "strict":         "off",
      "no-var":         "off",
      "eqeqeq":         ["error", "always", { null: "ignore" }],
      "no-console":     "warn",
      "no-debugger":    "error",
      "no-undef":       "error",
    },
  },
];
