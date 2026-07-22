import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F5F5F2",
        ink: "#171717",
        muted: "#727272",
        line: "#E4E4DF",
        orange: "#F26A2E",
        success: "#198754",
        dark: "#20252B",
        warning: "#F2B544",
        danger: "#D94A4A",
      },
      fontFamily: {
        sans: ["var(--font-manrope)"],
        display: ["var(--font-unbounded)"],
      },
    },
  },
  plugins: [],
} satisfies Config;
