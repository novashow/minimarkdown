import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Heavy async deps — only loaded on demand
          if (id.includes("katex")) return "katex";
          if (id.includes("marked-katex")) return "katex";
          // Sync but kept separate to parallelize loading
          if (id.includes("highlight.js")) return "hljs";
          if (id.includes("marked")) return "markdown";
          if (id.includes("@tauri-apps")) return "tauri";
          if (id.includes("react") || id.includes("i18next")) return "react";
          return undefined;
        },
      },
    },
  },
});
