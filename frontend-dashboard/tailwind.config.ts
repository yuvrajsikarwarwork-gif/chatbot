import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      colors: {
        background: "var(--bg-main)",
        card: "var(--bg-card)",
        foreground: "var(--text-main)",
        muted: "var(--text-muted)",
        border: "var(--border-main)",
        canvas: "var(--bg-main)",
        surface: "var(--bg-card)",
        sidebar: "var(--sidebar)",
        primary: {
          DEFAULT: "var(--primary)",
          soft: "var(--primary-soft)",
          fade: "var(--primary-fade)",
        },
        info: "var(--info)",
        accent: "var(--accent)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        success: "var(--success)",
        traffic: {
          human: "var(--traffic-human)",
          machine: "var(--traffic-machine)",
        },
        surfaceTone: {
          hover: "var(--state-hover)",
          active: "var(--state-active)",
          impersonation: "var(--state-impersonation)",
          danger: "var(--state-danger)",
        },
        "bg-main": "var(--bg-main)",
        "bg-card": "var(--bg-card)",
        "bg-muted": "var(--bg-muted)",
        "bg-subtle": "var(--bg-subtle)",
        "bg-overlay": "var(--bg-overlay)",
        "text-main": "var(--text-main)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        "text-soft": "var(--text-soft)",
        "text-inverse": "var(--text-inverse)",
        "border-main": "var(--border-main)",
        "border-sidebar": "var(--border-sidebar)",
        "border-light": "var(--border-main)",
        "border-dark": "var(--border-sidebar)",
      },
      spacing: {
        6: "var(--space-6)",
        8: "var(--space-8)",
        10: "var(--space-10)",
        12: "var(--space-12)",
        outer: "var(--outer-margin)",
        gutter: "var(--gutter)",
        rail: "var(--rail-w)",
        drawer: "var(--drawer-w)",
        "control-header": "var(--control-header-h)",
        "control-utility": "var(--control-utility-h)",
        "row-main": "var(--row-h-main)",
        "row-compact": "var(--row-h-compact)",
        banner: "var(--banner-h)",
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        hover: "var(--shadow-hover)",
      },
      maxWidth: {
        shell: "1280px",
      },
    },
  },
  plugins: [],
};

export default config;
