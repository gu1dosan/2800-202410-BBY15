/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './src/**/*.html',
    './src/**/*.js' // Include any JS files if you are using Tailwind in JS
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


