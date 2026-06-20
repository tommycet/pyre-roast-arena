# PYRE — Product Specification (Impeccable Input)

## Register
**product** — design serves the product (a GenLayer dApp, not a marketing surface).

## Personality
**Technical / lab-grade / combative.** A roast-battle arena is meant to feel like a courtroom + a forge: cold precision meets open flame. Sober, instrument-grade chrome with one ember accent for heat. Every surface earns its place — no decorative borders, no ornament that doesn't carry information.

## Anti-References (refuse-and-rewrite)
- **Corporate enterprise dashboard** — the #1 anti-pattern. No KPI tiles, no gradient stat cards, no SaaS-shell chrome.
- **Generic SaaS gradient** — no purple/indigo washes, no Tailwind-by-default gradient buttons.
- **Editorial-serif / consumer-app playful** — no soft rounded cards, no bouncy animations.
- **Emoji chaos** — no 🔥💀⚔️ scattered through copy. Heat is conveyed via color and motion, not icons.
- **Decorative borders** — `border-left` stripes on cards banned; no soft drop shadows paired with 1px borders.
- **Numbered section markers as default scaffolding** (01 / 02 / 03).

## Target User
A creator / comedian / shitposter who wants to put their banter on-chain with verifiable AI consensus. They appreciate the difference between "the AI said it" (one model, one opinion) and "the validators reached consensus" (multi-judge reputation). They live on Discord, X, Farcaster. They will judge us in 3 seconds.

## Tone
- **Terse, lab-grade.** All-caps monospace labels for IDs, status, network names.
- **No em-dashes** — use periods, colons, or commas.
- **Sober copy** — no exclamation marks in body. Exclamation is reserved for one or two moments per page (a verdict landed, a dispute resolved).
- **Honest about consensus wait** — show real wait time, never fake animated steppers.

## Accessibility
- **WCAG AA minimum**, measured. Body text ≥ 4.5:1, large text ≥ 3:1, placeholder text ≥ 4.5:1.
- Keyboard navigable. Focus rings visible.
- `prefers-reduced-motion` honored — 3D arena crossfades to a static card.

## Color Strategy (OKLCH)
- **Strategy**: committed. One saturated color (deep ember red `oklch(0.62 0.21 25)`) carries 30-50% of accent surface; emerald `oklch(0.74 0.16 162)` carries 10-15% for verified/won states; amber `oklch(0.78 0.15 75)` for disputed states.
- **Background**: `oklch(0.10 0.005 270)` (near-black with cool tint), NOT warm cream/sand.
- **Surface**: `oklch(0.14 0.005 270)` (one step up).
- **Ink**: `oklch(0.96 0.005 270)` (near-white).
- **Muted**: `oklch(0.65 0.008 270)` — needs contrast check; if <4.5:1, push toward ink end.
- **Ember (BURN)**: `oklch(0.62 0.21 25)` — used sparingly, with restraint.
- **Emerald (VERIFIED)**: `oklch(0.74 0.16 162)`.
- **Amber (DISPUTED)**: `oklch(0.78 0.15 75)`.

## Typography
- **Display**: Inter Tight or Geist, 700 weight, letter-spacing -0.02em (NOT -0.05 — too tight).
- **Body**: Inter or Geist, 400/500, line-height 1.5.
- **Mono (IDs, status, network)**: JetBrains Mono or Geist Mono, 500, uppercase, letter-spacing 0.05em.
- Hero display ceiling: `clamp(2.5rem, 5vw, 4.5rem)` (NOT 6rem).
- Body line length capped at 65-75ch.

## Layout
- Flexbox for 1D, Grid for 2D.
- Responsive grids: `repeat(auto-fit, minmax(320px, 1fr))`.
- Single semantic z-index scale: dropdown → sticky → modal-backdrop → modal → toast → tooltip.
- Battle arena 3D scene in a `position: relative` container; canvas full-bleed within the section, controls overlaid.

## 3D (Three.js)
- **Low-poly stylized arena.** Two faceless avatar cylinders (no characters, no faces) facing each other on a circular platform.
- Ember particles: instanced points, ~80 sprites, slow upward drift, fade out at top.
- Ambient orange-red glow from below the platform.
- Camera: slight tilt, no orbit controls (preset angles).
- Performance: target ≥ 30fps on integrated GPU. Disable on `prefers-reduced-motion` (render a static illustration instead).
- **Heavy is banned** — no post-processing, no Bloom beyond a subtle emissive on embers, no shadows beyond contact shadow.

## Motion
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out, no bounce, no elastic).
- Reduced motion honored everywhere.
- Stagger reveals per surface, not blanket.
- Verdict reveal: score ticks from 0 → final with `requestAnimationFrame` (no fake timer that lies).

## UX Copy Standards
- Status labels: ALL CAPS MONO. Examples: `CONSENSUS PENDING`, `VERIFIED WIN`, `DISPUTED`, `STUDIONET 61999`.
- Verdict score: large numeric, no fanfare.
- Errors: one sentence + one remediation step. Never "Something went wrong".

## Component Library (build BEFORE pages)
- `<Button variant="primary|ghost|burn" size="sm|md" />`
- `<Card variant="evidence|combatant|verdict" />`
- `<StatusPill state="pending|verified|disputed|burned" />`
- `<MonospaceLabel />`
- `<Arena3D combatants={[a,b]} state="pending|judging|resolved" />`
- `<ConnectWallet />`
- `<BurnInput />`
- `<ScoreCard scores={...} />`
- `<EmptyState icon illustration="..." />`
- `<ErrorState message hint />`
- `<LoadingState phase="..." />`

## Pages
1. **`/`** — Hero: "ROASTS COME AND GO. CONSENSUS IS FOREVER." + Live feed ticker + 3D arena preview + CTAs.
2. **`/arena`** — Open battles waiting for combatant 2.
3. **`/battle/[id]`** — Live battle view: 3D arena, two burn panes, judge status, verdict card.
4. **`/submit/[id]`** — Burn submission flow with honest consensus phases.
5. **`/flame`** — Hall of Flame leaderboard.
6. **`/combatant/[addr]`** — Profile: record (W-L), burn history, reputation.
7. **`/dispute/[id]`** — Dispute thread with reason + raised_by + resolution status.

## Anti-Slop Test
- First-order: can someone guess the theme from "AI judge dApp" alone? If they say "indigo gradient SaaS", we failed.
- Second-order: can someone guess from "roast battle arena" alone? If they say "comic-sans edgy consumer app with skull emojis", we failed.

The answer we want: "lab-instrument dark with a single ember accent and an avatar-stance 3D scene". Distinct from both reflexes.

## Free-Tier Constraint
Zero-cost deployment: Vercel for frontend, hosted GenLayer Studio for backend. No LLM API keys required from end user (validators pay). Captcha not needed.