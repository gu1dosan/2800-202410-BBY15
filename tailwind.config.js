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
        'lightPurple': '#DBB9F3',
        'darkPurple': '#500A82',
        'lavender': '#D6BAEF',
        'light-purple': '#9370DB',
        'red': '#F87171'
      },
    },
  },
  plugins: [],
}


