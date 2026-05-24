import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#080b12',
        surface: '#0c1020',
        surfaceElevated: '#0d1525',
        sidebar: '#0a0d16',
        border: '#151d2e',
        borderSubtle: '#131b2a',
        borderElevated: '#1a2540',
        cyan: '#06b6d4',
        'cyan-dim': '#0e4d6e',
      },
    },
  },
  plugins: [],
} satisfies Config
