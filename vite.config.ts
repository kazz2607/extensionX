import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    // Extension pages run in their own execution world. Chromium forks such
    // as Cốc Cốc report Vite's generated cross-origin modulepreload links as
    // cross-world resource mismatches. Native ES module imports are enough.
    modulePreload: false,
  },
  plugins: [
    webExtension({
      manifest: "manifest.json",
      additionalInputs: [
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
