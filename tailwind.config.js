/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'seikukai-orange': '#ff6600',
        'seikukai-navy': '#001f3f',
      },
    },
  },
  plugins: [],
}
