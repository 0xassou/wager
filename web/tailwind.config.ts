import type { Config } from "tailwindcss";

/**
 * Thème — identité de marque Arc Network, en double mode dark/light.
 *
 * Palette de référence :
 *  - Violet profond #663A73 : accent principal (CTA, highlights) — ponctuel
 *  - Bleu marine   #143453 : surfaces (dark) / texte (light)
 *  - Blanc         #FFFFFF : texte (dark) / surfaces (light)
 *
 * Toutes les couleurs pointent vers des variables CSS définies dans
 * globals.css (:root pour le light, .dark pour le dark). Le format
 * "R G B" + <alpha-value> permet de garder les opacités Tailwind
 * (ex: bg-primary/15) dans les deux modes.
 */
const config: Config = {
  darkMode: "class", // next-themes pose la classe .dark sur <html>
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-hover": "rgb(var(--surface-hover) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        "border-strong": "rgb(var(--border-strong) / <alpha-value>)",
        navy: "rgb(var(--navy) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        primary: "rgb(var(--primary) / <alpha-value>)",
        "primary-hover": "rgb(var(--primary-hover) / <alpha-value>)",
        "primary-light": "rgb(var(--primary-light) / <alpha-value>)",
        yes: "rgb(var(--yes) / <alpha-value>)",
        no: "rgb(var(--no) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // Ombres définies par thème dans globals.css
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
