import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--canvas)",
        card: "var(--surface)",
        foreground: "var(--text-main)",
        muted: "var(--text-muted)",
        border: "var(--border-main)",
        "border-light": "var(--border-main)",
        "border-dark": "var(--border-sidebar)",
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        sidebar: "var(--sidebar)",
        "text-main": "var(--text-main)",
        "text-text-muted": "var(--text-muted)",
        "text-sidebar": "var(--text-sidebar)",
        "text-sidebar-muted": "var(--text-sidebar-muted)",
        "border-main": "var(--border-main)",
        "border-sidebar": "var(--border-sidebar)",
        primary: {
          DEFAULT: "var(--primary)",
          fade: "var(--primary-fade)",
        },
      },
    },
  },
  plugins: [],
};
export default config;

