import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#030806",
        mint: "#63f3bf",
        emeraldGlow: "#22c58f",
      },
      boxShadow: {
        glow: "0 0 70px rgba(99, 243, 191, 0.24)",
        glass: "0 24px 80px rgba(0, 0, 0, 0.35)",
      },
      animation: {
        float: "float 7s ease-in-out infinite",
        rise: "rise 0.8s ease both",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0) rotate(var(--rotate, 0deg))" },
          "50%": { transform: "translateY(-18px) rotate(var(--rotate, 0deg))" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(22px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
