/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#43A047',
          'green-hover': '#388E3C',
          'green-light': '#EAF5EC',
          'green-dark': '#2E7D32',
        },
        scheduled: {
          bg: '#FEF3C7',
          text: '#B45309',
          border: '#FDE68A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
