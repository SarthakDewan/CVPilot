/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The browser talks only to the gateway. In dev, /api is proxied to it so the
// httpOnly session cookie stays same-origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.VITE_GATEWAY_URL ?? "http://localhost:4000", changeOrigin: false } },
  },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test-setup.ts"] },
});
