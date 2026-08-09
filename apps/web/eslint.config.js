// No purity gates here (unlike @morra/core) — this app owns the DOM/React
// tree, same posture as packages/recognition and packages/platform-web.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // XSS discipline (security audit M5): React already escapes text-node
      // interpolation by default — dangerouslySetInnerHTML is the one way
      // to defeat that, so it's banned outright rather than left to review
      // discipline. Error messages and any user-entered strings must render
      // as plain text-node children/props, never through this escape hatch.
      "react/no-danger": "error",
    },
    settings: {
      react: { version: "19" },
    },
  }
);
