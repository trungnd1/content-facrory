/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Design tokens from docs/screens templates
        primary: "#1337ec",
        "background-light": "#f6f6f8",
        "background-dark": "#101322",
        "surface-dark": "#1c1d27",
        "surface-darker": "#151725",
        "border-dark": "#3b3f54",
        "text-secondary": "#9da1b9",
        // Legacy tokens (dashboard skeleton)
        background: "#F9FAFB",
        surface: "#FFFFFF",
        border: "#E5E7EB",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.75rem",
      },
    },
  },
  plugins: [],
};
