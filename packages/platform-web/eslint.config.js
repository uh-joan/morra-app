// No purity gates here (unlike @morra/core) — this package IS the browser
// platform layer: DOM/Worker/AudioContext/localStorage/crypto/fetch access
// is the whole point (M3 dispatch: "platform-web owns ALL device access").
// Just the standard recommended TS rules, same as packages/recognition's.
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
