/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070709",
          900: "#0c0c10",
          800: "#14141a",
          700: "#1c1c24",
        },
        silver: {
          100: "#f4f1ea",
          200: "#d8d3c8",
          400: "#9a9488",
          500: "#7a7468",
        },
        ember: "#c4a574",
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "system-ui", "sans-serif"],
        serif: ["var(--font-instrument)", "Georgia", "serif"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(196, 165, 116, 0.12)",
      },
    },
  },
  plugins: [],
};
