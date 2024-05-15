/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './views/*.ejs',
    './*.html',
    './public/**/*.html',
    './src/**/*.html',
    './src/**/*.js' 
  ],
  theme: {
    extend: {
      colors: {
        'purple': '#6a0dad'
      },
    },
  },
  plugins: [],
}


