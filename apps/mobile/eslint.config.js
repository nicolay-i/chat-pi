// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/**"],
  },
  {
    rules: {
      // Data screens intentionally load remote state from effects. These calls
      // are asynchronous and are covered by screen tests, not React Compiler.
      "react-hooks/set-state-in-effect": "warn",
    },
  }
]);
