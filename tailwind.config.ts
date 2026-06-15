import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17201b",
        leaf: "#1f8a5b",
        mint: "#e8f7ef",
        linen: "#f7f1e8",
        saffron: "#f6b642"
      },
      boxShadow: {
        soft: "0 16px 40px rgba(23, 32, 27, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
