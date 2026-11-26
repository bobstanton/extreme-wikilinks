import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  globalIgnores(["node_modules", "main.js", "core.mjs", "types", "esbuild.config.mjs", "scripts"]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@microsoft/sdl/no-inner-html": "error",
      "@microsoft/sdl/no-document-write": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-new-func": "error",
    },
  },
]);
