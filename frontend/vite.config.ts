import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname),
  base: "/next/",
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["preact"],
          charts: ["echarts"]
        }
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:5055",
      "/img": "http://127.0.0.1:5055",
      "/uploads": "http://127.0.0.1:5055",
      "/vendor": "http://127.0.0.1:5055"
    }
  }
});
