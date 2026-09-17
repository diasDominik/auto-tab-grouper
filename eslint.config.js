import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  { ignores: ["node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
  {
    // Node scripts: tests and the asset build/verify tooling.
    files: ["test/**/*.js", "tools/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
];
