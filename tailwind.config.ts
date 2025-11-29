import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        lapis: {
          DEFAULT: '#03236f',
          dark: '#021a4a',
          light: '#3b82f6',
        },
        gold: {
          DEFAULT: '#fbbf24',
          light: '#fcd34d',
          dark: '#f59e0b',
        },
        burgundy: {
          DEFAULT: '#800020',
          dark: '#5c0017',
          light: '#a0002a',
        },
      },
    },
  },
  plugins: [],
};
export default config;

