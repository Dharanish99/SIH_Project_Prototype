import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(".."), "");
  const port = process.env.PORT ?? env.PORT ?? "4871",
    host = process.env.HOST ?? env.HOST ?? "127.0.0.1";
  return {
    plugins: [react()],
    server: {
      proxy: { "/api": `http://${host === "::1" ? "[::1]" : host}:${port}` },
    },
  };
});
