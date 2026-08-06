---
layout: false
title: strongsuit — dress your agent for the occasion
---

<!--
THESIS: A CLI's landing page as a fashion collection lookbook: suits of agent
customization presented as numbered LOOKs with true garment-tag spec strips.
Refuses the dark-SaaS hero + six feature cards this category always ships.
OWN-WORLD: Near-black ground; committed bullion gold (#e0a82e) owning whole
spreads; cream paper spec strips; Bodoni Moda display; Archivo tracked labels;
mono only for real commands; hairline print rules, no shadows.
STORY: A Claude Code power user sees their config treated as a wardrobe,
reads the care label of honest limits first, watches three looks prove
wear/review/session mechanisms with real commands, and installs.
FIRST VIEWPORT: Top bar (wordmark, Docs, GitHub). Masthead STRONGSUIT in
Didone at viewport scale, collection line, italic tagline, one-line category
explainer, single gold CTA "Get started" under the masthead.
FORM: Menswear lookbook, #3 on the derived list; user-chosen over dealt
direction 7 (vault). Seed: openssl-roll-7-user-override-lookbook (concept-seed
script inert in env; external entropy substituted, disclosed).
FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, and DESIGN.md.
-->

<div class="lb">

<header class="lb-bar">
  <a class="lb-mark" href="/strongsuit/">strong<span>suit</span></a>
  <nav class="lb-nav" aria-label="Site">
    <a href="/strongsuit/guide/getting-started.html">Docs</a>
    <a href="https://github.com/xooxoxxo/strongsuit">GitHub</a>
  </nav>
</header>

<main>

<section class="lb-cover">
  <p class="lb-season">The first collection · for Claude Code</p>
  <h1 class="lb-masthead">STRONGSUIT</h1>
  <p class="lb-tagline">Dress your agent for&nbsp;the&nbsp;occasion.</p>
  <p class="lb-standfirst">
    Skills, MCP servers, plugins and hooks, kept as named <em>suits</em> and worn
    with one command. Nothing is ever deleted. Everything remote is reviewed
    before it touches your machine.
  </p>
  <div class="lb-cta">
    <a class="lb-btn" href="/strongsuit/guide/getting-started.html">Get started</a>
    <a class="lb-quiet" href="https://github.com/xooxoxxo/strongsuit">Read the source</a>
  </div>
  <img class="lb-logo" src="/logo.png" alt="" width="180" height="180" loading="eager" />
</section>

<section class="lb-care" aria-labelledby="care-title">
  <div class="lb-care-inner">
    <h2 id="care-title">Care label</h2>
    <p class="lb-care-sub">Printed up front, where a care label belongs.</p>
    <ul>
      <li><strong>Per-session skills are additive.</strong> A <code>suit run</code> session wears its suit on top of your ambient set. The launcher prints what the baseline contributes; it never pretends to be exclusive.</li>
      <li><strong>Bare <code>claude --resume</code> bypasses the binding.</strong> Skills survive a resume; MCP isolation does not. Resume with <code>suit resume</code> and the outfit comes back on. No hook can protect a bare resume, so we say it here instead.</li>
      <li><strong>Token figures are estimates.</strong> Bytes divided by four: useful for comparing skills, never presented as a measurement.</li>
    </ul>
  </div>
</section>

<section class="lb-look lb-look--dark" aria-labelledby="look1-title">
  <p class="lb-looknum" aria-hidden="true">01</p>
  <div class="lb-look-body">
    <h2 id="look1-title"><span class="lb-look-kind">Look 01</span> Coding</h2>
    <p class="lb-look-copy">
      Your default outfit. <code>suit up coding</code> activates exactly this
      suit's components: file surfaces switch atomically by symlink, JSON
      surfaces go through an ownership ledger that never touches a key it
      didn't write. Switch back, or to anything else, in one command. The
      library keeps everything you own, forever.
    </p>
    <pre class="lb-term" aria-label="Terminal example"><code>$ suit up coding
  ✓ skills: docx, pptx, xlsx
Suit "coding" active.
$ suit status --short
coding · 3/12 · ~61tok</code></pre>
  </div>
  <aside class="lb-spec" aria-label="Suit specification">
    <p class="lb-spec-head">Composition</p>
    <dl>
      <div><dt>Skills</dt><dd>3</dd></div>
      <div><dt>MCP servers</dt><dd>0</dd></div>
      <div><dt>Hooks</dt><dd>0</dd></div>
      <div><dt>Loaded descriptions</dt><dd>~61 tok, estimated</dd></div>
      <div><dt>Reversal</dt><dd><code>suit off</code>, instant</dd></div>
    </dl>
    <p class="lb-spec-note">Sample wardrobe. Yours will differ.</p>
  </aside>
</section>

<section class="lb-look lb-look--gold" aria-labelledby="look2-title">
  <p class="lb-looknum" aria-hidden="true">02</p>
  <div class="lb-look-body">
    <h2 id="look2-title"><span class="lb-look-kind">Look 02</span> Research</h2>
    <p class="lb-look-copy">
      An installed suit, tailored elsewhere. <code>suit install acme/research-suit</code>
      fetches into quarantine: nothing exists outside it until you approve.
      Every component is printed in full and risk-classed, from prompt-surface
      to code-executing. Approval pins the exact bytes you read. If upstream
      changes, or anything tampers locally, activation blocks with a diff
      until a human looks again.
    </p>
    <pre class="lb-term" aria-label="Terminal example"><code>$ suit install acme/research-suit
── skills/paper-summarizer ── prompt-surface
  (full content shown)            approve? y
── hooks/Stop ─────────────── code-executing
  (command printed in full)       approve? n
Registered "research-suit": 4 approved, 1 rejected, pinned.</code></pre>
  </div>
  <aside class="lb-spec" aria-label="Suit specification">
    <p class="lb-spec-head">Provenance</p>
    <dl>
      <div><dt>Source</dt><dd>acme/research-suit</dd></div>
      <div><dt>Held in</dt><dd>quarantine until approved</dd></div>
      <div><dt>Approval</dt><dd>pinned to content, sha-256</dd></div>
      <div><dt>On drift</dt><dd>blocked, diff shown</dd></div>
      <div><dt><code>--yes</code> and hooks</dt><dd>never; code execution takes its own flag</dd></div>
    </dl>
    <p class="lb-spec-note">Sample listing. The pipeline is real.</p>
  </aside>
</section>

<section class="lb-look lb-look--dark" aria-labelledby="look3-title">
  <p class="lb-looknum" aria-hidden="true">03</p>
  <div class="lb-look-body">
    <h2 id="look3-title"><span class="lb-look-kind">Look 03</span> Writing, worn once</h2>
    <p class="lb-look-copy">
      A suit for one session. <code>suit run writing</code> materializes the suit
      as an ephemeral plugin, hands the session exactly this suit's MCP
      servers, and cleans up on exit. Nothing global changes. Put
      <code>writing</code> in a <code>.suitrc</code> and every session started in
      that folder dresses itself; <code>suit resume</code> re-dresses a
      conversation in the suit it was born with.
    </p>
    <pre class="lb-term" aria-label="Terminal example"><code>$ suit run writing -- -p "draft the launch post"
Session wears suit 'writing': 3 skills, 1 MCP server.
MCP is exclusive: this session gets only the suit's servers.</code></pre>
  </div>
  <aside class="lb-spec" aria-label="Suit specification">
    <p class="lb-spec-head">Session</p>
    <dl>
      <div><dt>Scope</dt><dd>this session only</dd></div>
      <div><dt>Global config</dt><dd>untouched</dd></div>
      <div><dt>MCP</dt><dd>exclusive, verified by tool count</dd></div>
      <div><dt>Skills</dt><dd>additive over ambient, stated at launch</dd></div>
      <div><dt>Cleanup</dt><dd>on exit, crashes swept</dd></div>
    </dl>
    <p class="lb-spec-note">Isolation measured, not assumed. <a href="https://github.com/xooxoxxo/strongsuit/blob/main/docs/session-isolation.md">The probes</a>.</p>
  </aside>
</section>

<section class="lb-fitting" aria-labelledby="fitting-title">
  <h2 id="fitting-title">The fitting</h2>
  <p class="lb-fitting-sub">Tailoring is a command, not a config format.</p>
  <pre class="lb-term lb-term--wide" aria-label="Terminal example"><code>$ suit tailor coding --skills docx,pptx,xlsx
Saved set "coding" with 3 skill(s).
$ suit show coding
coding
Skills
  ● on  docx     ● on  pptx     ● on  xlsx
$ suit list
 ● on   docx      ~18 tok
 ● on   pptx      ~19 tok
 ● on   xlsx      ~24 tok
 ○ off  brand-voice-enforcement   ~42 tok
 ○ off  legal-bd-sidekick         ~31 tok
3/5 active, ~61 of ~134 tokens loaded</code></pre>
</section>

<section class="lb-avail" aria-labelledby="avail-title">
  <div class="lb-avail-col">
    <h2 id="avail-title">Availability</h2>
    <p>Made to order, from source. The npm boutique opens with v1.0.0.</p>
    <pre class="lb-term" aria-label="Install commands"><code>git clone https://github.com/xooxoxxo/strongsuit
cd strongsuit && npm install && npm run build
npm link   # `suit` is now on your PATH</code></pre>
    <p class="lb-avail-docs">Then: <a href="/strongsuit/guide/getting-started.html">the getting-started guide</a> takes you from <code>suit init</code> to a worn suit in five steps.</p>
  </div>
  <div class="lb-avail-col lb-avail-proof">
    <h2>Proof, not promises</h2>
    <ul>
      <li>Session isolation verified with codeword and tool-count probes, method and dates published.</li>
      <li>Every safety guard mutation-tested: the guard was removed, the suite was verified to fail.</li>
      <li>348 tests, five CI platforms, MIT licensed.</li>
    </ul>
  </div>
</section>

</main>

<footer class="lb-foot">
  <p>strongsuit · MIT · token figures are estimates, not measurements</p>
  <nav aria-label="Footer">
    <a href="/strongsuit/guide/getting-started.html">Docs</a>
    <a href="/strongsuit/reference/commands.html">Commands</a>
    <a href="https://github.com/xooxoxxo/strongsuit">GitHub</a>
  </nav>
</footer>

</div>
