/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        raised: 'var(--raised)',
        ink: 'var(--ink)',
        mute: 'var(--mute)',
        faint: 'var(--faint)',
        line: 'var(--line)',
        inv: 'var(--inv)',
        invink: 'var(--invink)',
      },
      fontFamily: {
        display: ['"Bodoni Moda Variable"', '"Bodoni Moda"', 'Didot', '"Bodoni 72"', 'Georgia', 'serif'],
        sans: ['"Schibsted Grotesk Variable"', '"Schibsted Grotesk"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"Martian Mono Variable"', '"Martian Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
