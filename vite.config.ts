import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Rewrite raw control characters in emitted JS as \uXXXX escapes (same meaning, plain-text safe). */
function escapeControlChars(): Plugin {
  const fix = (s: string) => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  return {
    name: 'escape-control-chars',
    generateBundle(_, bundle) {
      for (const f of Object.values(bundle)) {
        if (f.type === 'chunk') f.code = fix(f.code);
        else if (/\.m?js$/.test(f.fileName)) f.source = fix(typeof f.source === 'string' ? f.source : new TextDecoder().decode(f.source));
      }
    },
  };
}

const shortcut = (name: string, hash: string) => ({ name, short_name: name, url: `./#${hash}`, icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] });

export default defineConfig({
  base: './',
  plugins: [
    react(),
    escapeControlChars(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null, // registered in main.tsx, skipped inside the claude.ai viewer
      includeAssets: ['icons/*.png'],
      manifest: {
        id: './',
        name: 'MonthLens',
        short_name: 'MonthLens',
        description: 'A plain-English monthly business review: where the money went, which ads worked, and what to change next month.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b0b0b',
        theme_color: '#0b0b0b',
        categories: ['finance', 'business', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [shortcut('Overview', 'overview'), shortcut('Import', 'import'), shortcut('Creators', 'creators'), shortcut('Next month', 'advisor')],
      },
      workbox: {
        // the app shell, code and photos work offline from the first visit
        globPatterns: ['**/*.{js,mjs,css,html,png,jpg,woff2,webmanifest}'],
        globIgnores: ['ocr/**', 'artifact*.html'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          // OCR engine and language data (~14 MB): fetched the first time someone scans, then kept
          { urlPattern: ({ url }) => url.pathname.includes('/ocr/'), handler: 'CacheFirst', options: { cacheName: 'monthlens-ocr', expiration: { maxEntries: 10 } } },
        ],
      },
    }),
  ],
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
  test: { environment: 'node' },
} as any);
