import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Yeni panel görünümü (v2) — değerler src/app/globals.css'teki CSS
      // değişkenlerinden gelir, açık/koyu tema orada değişir. Kullanım:
      // bg-v2-surface, text-v2-fg-muted, border-v2-line, bg-v2-primary/90…
      colors: {
        v2: Object.fromEntries(
          [
            "bg", "surface", "surface-2", "muted", "line", "line-strong",
            "fg", "fg-muted", "fg-subtle",
            "primary", "primary-hover", "primary-soft", "link",
            "sidebar", "sidebar-fg", "sidebar-muted", "sidebar-active", "sidebar-line", "accent",
            "success-bg", "success-fg", "warning-bg", "warning-fg", "info-bg", "info-fg", "danger-bg", "danger-fg",
          ].map((name) => [name, `rgb(var(--v2-${name}) / <alpha-value>)`])
        ),
      },
      fontFamily: {
        "v2-sans": ["var(--font-v2-sans)", "system-ui", "sans-serif"],
        "v2-mono": ["var(--font-v2-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "toast-in": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "toast-in": "toast-in 0.2s ease-out",
      },
    },
  },
  plugins: [
    // v2: ön eki — yalnızca yeni panel görünümünde (html[data-ui="v2"])
    // uygulanan sayfa rötuşları, ör. "rounded-lg v2:rounded-xl".
    plugin(({ addVariant }) => {
      addVariant("v2", 'html[data-ui="v2"] &');
    }),
  ],
};
export default config;
