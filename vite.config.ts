import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  plugins: [
    webExtension({
      manifest: "manifest.json",
      additionalInputs: [
        "cleanup/cleanup.html",
        "offscreen/offscreen.html",
        "content/page-interceptor.ts",
        "content/dom-scanner.ts",
        "content/fab.ts",
        "content/tweet-btn.ts",
        "content/snackbar.ts",
        "lib/utils.ts",
        "lib/hls-fetcher.ts",
        "lib/i18n.ts"
      ],
    }),
  ],
});
