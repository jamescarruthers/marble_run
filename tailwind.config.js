/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fredoka', 'sans-serif'],
        body: ['Nunito', 'sans-serif'],
      },
      colors: {
        pink: 'var(--pink)',
        mint: 'var(--mint)',
        butter: 'var(--butter)',
        sky: 'var(--sky)',
        'sky-deep': 'var(--sky-deep)',
        lavender: 'var(--lavender)',
        cream: 'var(--cream)',
        bark: 'var(--bark)',
      },
    },
  },
  plugins: [],
};
