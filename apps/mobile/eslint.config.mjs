import { defineConfig } from "eslint/config";
import expo from "eslint-config-expo/flat.js";

export default defineConfig([
  ...expo,
  {
    ignores: [
      ".expo/**",
      "dist/**",
      "build/**",
      "android/**",
      "ios/**",
      "node_modules/**",
      "scripts/**",
    ],
  },
]);
