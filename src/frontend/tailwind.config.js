/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        nutri: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          primary: '#107C41', // Màu xanh chủ đạo thương hiệu NutriSnap
          dark: '#0B522B',
          surface: '#F8FAFC',
          // Semantic aliases keep the existing brand and Slate conventions.
          panel: '#FFFFFF',
          ink: '#0F172A',
          muted: '#475569',
          border: '#CBD5E1',
          selected: '#F0FDF4',
          focus: '#107C41',
          error: '#B91C1C',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
