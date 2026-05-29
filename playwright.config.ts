import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:5055/next/",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "node mua_ops_node/server.js --port 5055",
    url: "http://127.0.0.1:5055/api/summary",
    reuseExistingServer: true,
    timeout: 60_000
  }
});
