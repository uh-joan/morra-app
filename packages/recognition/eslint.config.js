// No purity gates here (unlike @morra/core) — this package IS the DOM/
// Worker/AudioWorklet-facing glue, by design (team-lead's M2 dispatch:
// "browser-facing TS package, DOM allowed here"). Just the standard
// recommended TS rules.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  }
);
