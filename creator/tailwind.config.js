/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Corpo: Inter (variável, com tamanho óptico). Títulos e números: Sora.
        // Para trocar a fonte dos títulos, altere aqui e o <link> do Google Fonts em index.html.
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: { DEFAULT: '#E10600', dark: '#B00500', light: '#FF3B30', soft: '#FDECEC' },
        ink: { DEFAULT: '#0B0B0C', 900: '#0B0B0C', 800: '#141416', 700: '#1E1E21', 600: '#2A2A2E' },
        // Neutros levemente quentes: dão um acabamento mais editorial que o cinza azulado padrão
        zinc: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [n, `rgb(var(--z${n}) / <alpha-value>)`])),
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        card: '0 1px 0 rgba(23,23,22,.03), 0 1px 2px rgba(23,23,22,.04), 0 10px 28px -14px rgba(23,23,22,.12)',
        'card-hover': '0 1px 0 rgba(23,23,22,.03), 0 2px 4px rgba(23,23,22,.05), 0 18px 40px -16px rgba(23,23,22,.22)',
        pop: '0 2px 6px rgba(23,23,22,.06), 0 24px 48px -12px rgba(23,23,22,.24)',
        brand: '0 8px 20px -8px rgba(225,6,0,.55)',
      },
      transitionTimingFunction: { out: 'cubic-bezier(.22,.8,.24,1)' },
      keyframes: {
        tourIn: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        fadeUp: { from: { opacity: '0', transform: 'translateY(14px)' }, to: { opacity: '1', transform: 'none' } },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        scaleIn: { from: { opacity: '0', transform: 'translateY(-4px) scale(.97)' }, to: { opacity: '1', transform: 'none' } },
        modalIn: { from: { opacity: '0', transform: 'translateY(16px) scale(.98)' }, to: { opacity: '1', transform: 'none' } },
        growX: { from: { clipPath: 'inset(0 100% 0 0)' }, to: { clipPath: 'inset(0 0 0 0)' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        floaty: { '0%,100%': { transform: 'translateY(0) rotate(var(--r,0deg))' }, '50%': { transform: 'translateY(-14px) rotate(var(--r,0deg))' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(225,6,0,.45)' }, '100%': { boxShadow: '0 0 0 10px rgba(225,6,0,0)' } },
      },
      animation: {
        'fade-up': 'fadeUp .55s cubic-bezier(.22,.8,.24,1) both',
        'fade-in': 'fadeIn .25s ease-out both',
        'scale-in': 'scaleIn .16s cubic-bezier(.22,.8,.24,1) both',
        'modal-in': 'modalIn .28s cubic-bezier(.22,.8,.24,1) both',
        'grow-x': 'growX .9s cubic-bezier(.22,.8,.24,1) both',
        shimmer: 'shimmer 1.8s linear infinite',
        floaty: 'floaty 9s ease-in-out infinite',
        'pulse-ring': 'pulseRing 1.8s ease-out infinite',
      },
    },
  },
  plugins: [],
}
