export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ["Inter", "sans-serif"],
        caveat: ["Caveat", "cursive"],
        mono: ["monospace"],
      },
      transitionDuration: {
        "280": "280ms",
      },
      animation: {
        "in": "fadeIn 0.2s ease",
      },
      keyframes: {
        fadeIn: {
          "from": { opacity: "0" },
          "to": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
}