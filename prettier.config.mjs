/** @type {import("prettier").Config} */
const config = {
  plugins: ["prettier-plugin-tailwindcss"],
  proseWrap: "always",
  tailwindStylesheet: "./src/app/globals.css",
};

export default config;
