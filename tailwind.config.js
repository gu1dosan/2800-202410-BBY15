/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './src/**/*.{html,js}',
    './public/**/*.{html,js}',
    './views/**/*.ejs',
  ],
  theme: {
    extend: {
      colors: {
        'purple': '#6a0dad',
        'lavender': '#e6e6fa',
        'light-purple': '#9370DB'
      },
    },
  },
  plugins: [],
}


