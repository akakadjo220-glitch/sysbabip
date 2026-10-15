/** Tailwind compilé au build (remplace cdn.tailwindcss.com, qui compilait dans le navigateur). */
export default {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './views/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './context/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
};
