// Purity gates for @morra/core (plan's Architecture section: "PURE TS; ESLint
// gates: no DOM lib, no crypto globals..."). tsconfig's `lib: ["ES2022"]`
// (no "DOM") already makes window/document/localStorage/crypto fail to
// typecheck; these ESLint rules are defense-in-depth for plain-JS-shaped
// code (e.g. behind an `any` cast) and give a clearer, purity-specific error
// message than a generic TS2304/TS2339.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const RESTRICTED_GLOBALS = [
  "window", "document", "localStorage", "sessionStorage", "navigator",
  "crypto", "fetch", "XMLHttpRequest", "WebSocket", "Worker",
  "AudioContext", "AudioWorkletNode", "MediaRecorder", "requestAnimationFrame",
];

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-restricted-globals": [
        "error",
        ...RESTRICTED_GLOBALS.map((name) => ({
          name,
          message: `${name} is a DOM/browser/ambient-crypto global — @morra/core must stay platform-agnostic. Inject the capability via a src/ports/ interface instead.`,
        })),
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Math.random() is ambient nondeterministic randomness — inject and call a RandomSource port (src/ports/random-source.ts) instead, so decisions stay pure/replayable.",
        },
      ],
    },
  }
);
