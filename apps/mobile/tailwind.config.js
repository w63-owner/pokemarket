/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./features/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "rgb(255 255 255)",
        foreground: "rgb(15 23 42)",
        card: "rgb(255 255 255)",
        "card-foreground": "rgb(15 23 42)",
        primary: {
          DEFAULT: "#E63946",
          foreground: "rgb(255 255 255)",
        },
        secondary: {
          DEFAULT: "rgb(241 245 249)",
          foreground: "rgb(15 23 42)",
        },
        muted: {
          DEFAULT: "rgb(241 245 249)",
          foreground: "rgb(100 116 139)",
        },
        accent: {
          DEFAULT: "rgb(241 245 249)",
          foreground: "rgb(15 23 42)",
        },
        destructive: {
          DEFAULT: "rgb(239 68 68)",
          foreground: "rgb(255 255 255)",
        },
        border: "rgb(226 232 240)",
        input: "rgb(226 232 240)",
        ring: "#E63946",
      },
      fontFamily: {
        sans: ["System"],
      },
    },
  },
  plugins: [],
};
