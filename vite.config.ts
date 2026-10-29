/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { VitePWA } from "vite-plugin-pwa";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

// GitHub Pages serves the app from /<repo>/, local dev from /.
const base = process.env.GITHUB_ACTIONS ? "/Symulator-walcowania/" : "/";

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
  plugins: [
    {
      // GitHub Pages cannot send headers, so the policy ships as a meta tag. Dev is excluded because
      // Vite injects inline styles there.
      name: "content-security-policy",
      apply: "build",
      transformIndexHtml: () => [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
          injectTo: "head-prepend",
        },
      ],
    },
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Symulator walcowania",
        short_name: "Walcowanie",
        description:
          "Plate rolling calculator: blank length, diameters, springback, DXF/PDF export.",
        lang: "pl",
        start_url: ".",
        scope: ".",
        display: "standalone",
        orientation: "any",
        background_color: "#0a0a0b",
        theme_color: "#0a0a0b",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,ttf,glb}"],
        // Optional jsPDF plugins (HTML rendering) are never used; keep them out of the offline cache.
        globIgnores: ["**/html2canvas-*.js", "**/purify.es-*.js", "**/index.es-*.js"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
