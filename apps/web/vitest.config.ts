import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" lança erro fora do React Server; nos testes vira um módulo vazio
      "server-only": fileURLToPath(new URL("./src/test/vazio.ts", import.meta.url)),
    },
  },
  test: { environment: "node" },
});
