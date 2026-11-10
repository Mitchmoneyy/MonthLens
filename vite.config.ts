import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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

export default defineConfig({
  base: './',
  plugins: [react(), escapeControlChars()],
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
  test: { environment: 'node' },
} as any);
