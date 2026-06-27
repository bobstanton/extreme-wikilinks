import js from "@eslint/js";
import tsparser from "@typescript-eslint/parser";
import tseslint from "@typescript-eslint/eslint-plugin";
import sdl from "@microsoft/eslint-plugin-sdl";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      globals: {
        window: 'readonly',
      },
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: 2020,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "@microsoft/sdl": sdl,
      obsidianmd,
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "no-unused-vars": "off",
      "@microsoft/sdl/no-inner-html": "error",
      "@microsoft/sdl/no-document-write": "error",
      "no-console": ["warn", { "allow": ["warn", "error"] }],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-var": "error",
      "obsidianmd/no-plugin-as-component": "error",
      "obsidianmd/no-view-references-in-plugin": "error",
      "obsidianmd/regex-lookbehind": "error"
    }
  }
];
