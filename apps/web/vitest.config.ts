import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    server: {
      deps: {
        inline: ["@deckdealr/shared"],
      },
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      {
        find: /^server-only$/,
        replacement: path.resolve(__dirname, "./src/test-utils/server-only.ts"),
      },
      {
        find: "@deckdealr/shared",
        replacement: path.resolve(__dirname, "../../packages/shared/src"),
      },
    ],
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
});
