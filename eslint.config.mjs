// ESLint flat config. Run with `npm run lint`.
import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["web/vendor/**", "node_modules/**", "target/**", "dist/**", "workspace/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    rules: {
      // Existing-code cleanup backlog: these style rules are off until the code is tidied.
      // Correctness rules from js.configs.recommended stay on.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // Web app loads preact/htm from vendor and exposes Dojo* namespaces as globals.
    files: ["web/**/*.js", "modules/**/*.js"],
    languageOptions: {
      globals: {
        preact: "readonly",
        htm: "readonly",
        DojoTypes: "readonly",
        DojoExt: "readonly",
        DojoWasm: "readonly",
        DojoSession: "readonly",
        DojoApp: "readonly",
        DojoStorage: "readonly",
        DojoMigrate: "readonly",
      },
    },
  },
];
