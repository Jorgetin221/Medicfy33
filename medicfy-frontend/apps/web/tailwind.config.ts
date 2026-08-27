import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          900: "var(--brand-900)",
          700: "var(--brand-700)",
          500: "var(--brand-500)",
          100: "var(--brand-100)",
        },
        gray: {
          900: "var(--gray-900)",
          700: "var(--gray-700)",
          500: "var(--gray-500)",
          300: "var(--gray-300)",
          100: "var(--gray-100)",
        },
        rail: {
          bg: "var(--rail-bg)",
          icon: "var(--rail-icon)",
          "icon-active-bg": "var(--rail-icon-active-bg)",
          "icon-active": "var(--rail-icon-active)",
        },
        danger: { 600: "var(--danger-600)", 50: "var(--danger-050)" },
        warn: { 600: "var(--warn-600)", 50: "var(--warn-050)" },
        success: { 600: "var(--success-600)", 50: "var(--success-050)" },
        critical: { 600: "var(--critical-600)", 50: "var(--critical-050)" },
      },
      fontFamily: {
        heading: ["var(--font-heading)"],
        body: ["var(--font-body)"],
        brand: ["var(--font-brand)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        xs: "var(--text-xs)",
        sm: "var(--text-sm)",
        base: "var(--text-base)",
        lg: "var(--text-lg)",
        xl: "var(--text-xl)",
        "2xl": "var(--text-2xl)",
        "3xl": "var(--text-3xl)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [],
} satisfies Config;
