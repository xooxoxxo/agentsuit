import { defineConfig } from "vitepress";

export default defineConfig({
  title: "strongsuit",
  description:
    "Agentic suits for Claude Code — skills, MCP servers, plugins, and hooks as named, atomically-switchable bundles with a review pipeline for remote installs.",
  base: "/strongsuit/",
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/strongsuit/logo.png" }],
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
