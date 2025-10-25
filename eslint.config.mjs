import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        chrome: "readonly",
        console: "readonly",
        document: "readonly",
        window: "readonly",
        setTimeout: "readonly",
        Promise: "readonly",
        Map: "readonly",
        Set: "readonly",
        URL: "readonly",
        alert: "readonly",
      },
    },
    rules: {
      // Add any specific rules you want to enforce here.
    },
  },
];
