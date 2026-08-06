import { defineConfig } from "vitepress";

const DIRECTION_CONTRACT = `<!--
THESIS: A CLI's landing page as a fashion collection lookbook: suits of agent customization presented as numbered LOOKs with true garment-tag spec strips. Refuses the dark-SaaS hero + feature-card grid this category always ships.
OWN-WORLD: Near-black ground; committed bullion gold (#e0a82e) owning whole spreads; cream paper spec strips; Bodoni Moda display; Archivo tracked labels; mono only for real commands; hairline print rules, no shadows.
STORY: A Claude Code power user sees their config treated as a wardrobe, reads the care label of honest limits first, watches three looks prove wear/review/session mechanisms with real commands, and installs.
FIRST VIEWPORT: Top bar (wordmark, Docs, GitHub); STRONGSUIT masthead in Didone at viewport scale; collection line; italic tagline; category explainer; single gold Get-started CTA.
FORM: Menswear lookbook, #3 on the derived list; user-chosen over dealt direction 7 (vault). Seed: openssl-roll-7-user-override-lookbook.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md.
-->`;

export default defineConfig({
  title: "strongsuit",
  description:
    "Agentic suits for Claude Code — skills, MCP servers, plugins, and hooks as named, atomically-switchable bundles with a review pipeline for remote installs.",
  base: "/strongsuit/",
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/strongsuit/logo.png" }],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    ["link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" }],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700&family=Bodoni+Moda:ital,opsz,wght@0,6..96,500;0,6..96,700;0,6..96,800;1,6..96,500&display=swap",
      },
    ],
    ["meta", { property: "og:title", content: "strongsuit — dress your agent for the occasion" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Named, atomically-switchable bundles of Claude Code customization, with a review pipeline for anything remote.",
      },
    ],
  ],
  appearance: "dark",
  transformHtml(html, id) {
    if (id.endsWith("index.html") && !id.includes("guide") && !id.includes("reference")) {
      return html.replace("<body>", "<body>\n" + DIRECTION_CONTRACT);
    }
  },
  themeConfig: {
    logo: "/logo.png",
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Reference", link: "/reference/commands" },
      { text: "GitHub", link: "https://github.com/xooxoxxo/strongsuit" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Suits", link: "/guide/suits" },
          { text: "Installing remote suits", link: "/guide/review" },
          { text: "Per-session suits", link: "/guide/sessions" },
          { text: "Safety model", link: "/guide/safety" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Commands", link: "/reference/commands" },
          { text: "Suit manifest", link: "/reference/manifest" },
        ],
      },
    ],
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: "https://github.com/xooxoxxo/strongsuit" }],
    footer: {
      message: "MIT licensed. Token figures are estimates, not measurements.",
      copyright: "© 2026 xooxoxxo",
    },
  },
});
