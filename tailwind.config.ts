import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        masthead: ["UnifrakturMaguntia", "Georgia", "serif"],
        display: ["Playfair Display", "Georgia", "serif"],
        body: ["IM Fell English", "Georgia", "serif"],
        serif: ["Georgia", "Times New Roman", "serif"],
      },
      colors: {
        newsprint: {
          50: "#faf8f3",
          100: "#f2ede2",
          200: "#e8e4da",
          300: "#d4cfc4",
          400: "#a09880",
          500: "#7a7060",
          600: "#5a5248",
          700: "#3a3430",
          800: "#1a1a18",
          900: "#0d0d0c",
        },
        ink: "#0d0d0d",
        gold: "#c8a84b",
        parchment: "#faf8f3",
        aged: "#ede9e1",
      },
      borderRadius: {
        editorialSm: "8px",
        editorialMd: "12px",
        editorialLg: "16px",
      },
      boxShadow: {
        editorialPage: "0 18px 46px rgba(28, 22, 12, 0.14)",
        editorialOverlay: "0 22px 68px rgba(17, 12, 6, 0.3)",
        editorialPopover: "0 14px 40px rgba(15, 10, 6, 0.24)",
      },
      animation: {
        "fade-slide-in": "fadeSlideIn 0.5s ease forwards",
        spin: "spin 1s linear infinite",
      },
      keyframes: {
        fadeSlideIn: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
