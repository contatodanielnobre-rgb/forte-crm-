import type { Config } from "tailwindcss";
export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#D91E3A", 50: "#FDEEF1", 100: "#FBD5DC", 200: "#F6A9B7", 300: "#F07C92", 400: "#E74E6B", 500: "#D91E3A", 600: "#B5172F", 700: "#8F1225", 800: "#690D1B", 900: "#430811" },
        gold: { DEFAULT: "#D4A017", light: "#F2CB5A" },
        silver: "#A8B0BC",
        bronze: "#C47A3C",
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
      boxShadow: { card: "0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px rgb(0 0 0 / 0.04)" },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
      keyframes: { fadeUp: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } } },
      animation: { fadeUp: "fadeUp .25s ease-out both" },
    },
  },
  plugins: [],
} satisfies Config;
