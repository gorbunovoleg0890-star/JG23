export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Source Serif 4"', 'serif']
      },
      colors: {
        ink: {
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155'
        },
        law: {
          50: '#f8f5f0',
          100: '#efe7da',
          200: '#e2d1b6',
          300: '#cda97b',
          400: '#b5874e',
          500: '#9a6b37',
          600: '#7e522a'
        },
        accent: {
          500: '#b91c1c'
        }
      },
      backgroundImage: {
        "law-gradient": "radial-gradient(circle at top, rgba(244, 236, 222, 0.7), rgba(15, 23, 42, 0.85))"
      }
    }
  },
  plugins: []
};
