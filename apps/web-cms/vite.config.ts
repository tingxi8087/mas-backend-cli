import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "");
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    base: command === "build" ? "./" : "/",
    build: {
      outDir: path.resolve(__dirname, "../../dist/web-cms"),
      // 只清理前端产物目录，不影响同级 server。
      emptyOutDir: true,
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target:
            process.env.API_PROXY_TARGET ||
            env.API_PROXY_TARGET ||
            "http://127.0.0.1:9811",
          changeOrigin: false,
        },
      },
    },
  };
});
