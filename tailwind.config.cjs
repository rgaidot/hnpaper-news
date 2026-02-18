/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./templates/**/*.html", "./content/**/*.md", "./client/**/*.ts"],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}