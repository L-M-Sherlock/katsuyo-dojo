import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/katsuyo-dojo/",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        root: fileURLToPath(new URL("./index.html", import.meta.url)),
        "zh-CN": fileURLToPath(new URL("./zh-CN/index.html", import.meta.url)),
        en: fileURLToPath(new URL("./en/index.html", import.meta.url)),
      },
    },
  },
});
