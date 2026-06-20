import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// "@/..." を Next と同じくリポジトリルート起点に解決する。
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
