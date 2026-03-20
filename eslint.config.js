import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Disallow floating promises — critical for async correctness
      "@typescript-eslint/no-floating-promises": "error",
      // Disallow awaiting non-thenables
      "@typescript-eslint/await-thenable": "error",
      // Require Promise-returning functions to be handled
      "@typescript-eslint/no-misused-promises": "error",
      // Ban `any` — use `unknown` instead
      "@typescript-eslint/no-explicit-any": "error",
      // Require explicit return types on exported functions
      "@typescript-eslint/explicit-module-boundary-types": "error",
      // Disallow non-null assertions
      "@typescript-eslint/no-non-null-assertion": "error",
      // Disallow unused variables (TS-aware, allows _-prefixed)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Prefer `const` over `let` where possible
      "prefer-const": "error",
      // No console logging in library code
      "no-console": "error",
    },
  },
);
