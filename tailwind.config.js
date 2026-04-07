/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // メインカラー：誠空会オレンジ
        'seikukai-orange': '#ff6600', 
        // サブカラー：誠空会ネイビー
        'seikukai-navy': '#001f3f', 
      },
    },
  },
  plugins: [],
}
