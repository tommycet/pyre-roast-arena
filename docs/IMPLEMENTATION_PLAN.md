# PYRE — Roast Battle Arena on GenLayer
**Implementation Plan**

> **For Hermes:** Use subagent-driven-development skill to execute this plan task-by-task. Fresh subagent per task, TDD red-green-refactor per task, task review (spec compliance + code quality) after each.

---

## Goal

Build **PYRE**, an on-chain roast battle arena on GenLayer where two combatants submit burns on a shared topic, AI validators judge which roast wins on wit/originality/burn-intensity/rhyme/topicality, winners earn reputation, and community disputes can be raised. Deployed to studionet first, then bradbury.

## Why PYRE (the gap)

Existing GenLayer dApps cover factual verification (EcoVerify), prediction markets, freelance escrow, weather/crypto/HN oracles, RPG game masters, and AI notaries. **Nothing playful + subjective + community-submitted-content judging.** PYRE uses GenLayer's "Optimistic Democracy" exactly where it shines: subjective creative content that humans can't agree on either, but where multiple AI judges converging is more credible than a single model.

## Architecture

```
pyre/
├── contracts/
│   └── pyre.py                  # Intelligent Contract (Python)
│       # Storage:
│       #   battles: TreeMap[u256, Battle]
│       #   combatants: TreeMap[Address, Combatant]
│       #   disputes: TreeMap[u256, Dispute]
│       #   counter: u256
│       #   treasury: u256
│       #
│       # Public methods:
│       #   create_battle(topic: str, stake: u256) -> u256
│       #   join_battle(battle_id: u256) -> None
│       #   submit_burn(battle_id: u256, burn_text: str, context_url: str) -> None
│       #   judge_battle(battle_id: u256) -> u256  # returns verdict_id
│       #   raise_dispute(battle_id: u256, reason: str) -> None
│       #   resolve_dispute(dispute_id: u256) -> None
│       #   get_battle(battle_id: u256) -> str  (json)
│       #   get_recent_battles(limit, offset) -> str (json)
│       #   get_combatant(addr: str) -> str (json)
│       #   get_stats() -> str (json)
├── frontend/                     # Vite + React + TS + Three.js
│   ├── src/
│   │   ├── components/
│   │   │   ├── Arena.tsx         # Three.js 3D fight scene
│   │   │   ├── BattleCard.tsx
│   │   │   ├── BurnSubmit.tsx
│   │   │   ├── HallOfFlame.tsx   # Leaderboard
│   │   │   ├── DisputePanel.tsx
│   │   │   └── ui/               # Impeccable design system
│   │   ├── lib/
│   │   │   ├── genlayer.ts       # createClient + createAccount
│   │   │   └── format.ts
│   │   ├── services/
│   │   │   └── pyre.ts           # read/write wrappers
│   │   └── three/
│   │       └── arena.ts          # Three.js scene factory
│   └── index.html
├── tests/
│   ├── direct/                   # Fast in-memory (mock genlayer)
│   │   ├── test_create_battle.py
│   │   ├── test_submit_burn.py
│   │   ├── test_judge_battle.py
│   │   ├── test_dispute.py
│   │   ├── test_reputation.py
│   │   └── test_views.py
│   ├── integration/              # Full tests against GenLayer Studio
│   │   └── test_e2e_pyre.py
│   └── conftest.py               # mock genlayer fixture
├── scripts/
│   ├── deploy_studionet.sh
│   ├── deploy_bradbury.sh
│   └── live_e2e.mjs
├── docs/
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   └── BENCHMARKS.md
├── PRODUCT.md                    # Impeccable input
├── DESIGN.md                     # Impeccable output (generated)
├── deploy/deployScript.ts
├── gltest.config.yaml
├── pyproject.toml
└── package.json
```

## Tech Stack

- **Contract**: Python 3.12, GenVM SDK (py-genlayer 1jb45aa8)
- **Frontend**: Vite + React + TypeScript + TanStack Query + Three.js
- **SDK**: `genlayer-js` v1.x (createClient/createAccount API)
- **Tests**: pytest (direct), Node.js script (integration + live)
- **Indexer**: codebase-memory-mcp
- **Design**: Impeccable skill (dark, evidence-instrument, emerald accents)

## Design Principles (Impeccable input → PRODUCT.md)

- **Register**: product (dApp, design serves function)
- **Personality**: technical / lab-grade / combative
- **Anti-references**: corporate enterprise dashboard, generic SaaS gradient, playful consumer app, emoji chaos
- **Tone**: terse, lab-instrument labels (uppercase, monospace for IDs), sober copy, no em-dashes
- **Color**: near-black bg (#0A0A0B OKLCH), deep ember red accent for "BURN", emerald (#10B981) for "VERIFIED WIN", amber for "DISPUTED"
- **3D**: Three.js, low-poly stylized arena with two faceless avatars facing off, ember particles, minimal (< 60fps target on integrated GPU)

## Key Storage & Method Signatures (Python)

```python
# Storage types — STRICT (no int/dict/list)
battles: TreeMap[u256, Battle]
combatants: TreeMap[str, Combatant]
disputes: TreeMap[u256, Dispute]
battle_counter: u256
dispute_counter: u256
treasury: u256
ENTRY_FEE: u256 = u256(10**16)  # 0.01 GEN — class constant, not stored
```

## Equivalence Principle Choice

- **`prompt_non_comparative`** for `judge_battle` — validators judge leader's scorecard against criteria, don't re-run the judging (subjective creative content, perfect fit)
- Criteria explicit: 5 dimensions (wit, originality, burn, rhyme, topicality), each 0-20, total 0-100, output strict JSON
- Validators check the JSON matches schema, scores in bounds, winner is the higher-scoring side
- Disputes re-trigger via a fresh consensus path with strict_eq on the final score

## TDD Approach (per task)

1. Write failing test asserting contract behavior
2. Run `pytest tests/direct/test_<name>.py -v` — confirm FAIL
3. Write minimal Python to pass
4. Re-run — confirm PASS
5. `git commit -m "feat: <name>"`

## Deployment Strategy

1. Deploy to studionet (gas-free, fast iteration, mock validators)
2. Browser-verify via Playwright: submit burn, wait for consensus, see verdict
3. Run benchmark suite
4. Deploy to bradbury with funded deployer (real LLM judges)
5. Re-verify with extended polling (5-6 min consensus)

---

## Task List

### Phase 0: Setup
- Task 0.1: Init pyproject.toml + install deps (pytest, py-genlayer-stub mock)
- Task 0.2: Init frontend Vite + React + TS + Three.js + TanStack Query
- Task 0.3: Write PRODUCT.md for Impeccable
- Task 0.4: Index codebase

### Phase 1: Contract Core (TDD)
- Task 1.1: conftest.py with mock genlayer
- Task 1.2: Pyre.__init__ + Battle/Combatant/Dispute dataclasses
- Task 1.3: create_battle (writes topic, opens duel slot)
- Task 1.4: join_battle (combatant 2 joins, stake matched)
- Task 1.5: submit_burn (combatant 1 burns)
- Task 1.6: submit_burn (combatant 2 burns)
- Task 1.7: judge_battle (LLM non-comparative verdict)
- Task 1.8: raise_dispute
- Task 1.9: resolve_dispute
- Task 1.10: get_battle / get_recent_battles / get_combatant / get_stats (view)

### Phase 2: Frontend (Impeccable + Three.js)
- Task 2.1: Design system tokens (OKLCH, fonts, scale)
- Task 2.2: App shell + routing + nav
- Task 2.3: Connect wallet + chain config (studionet / bradbury)
- Task 2.4: BattleCard component
- Task 2.5: BurnSubmit flow with honesty phases
- Task 2.6: HallOfFlame leaderboard
- Task 2.7: Three.js Arena scene (two avatars, ember particles)
- Task 2.8: DisputePanel
- Task 2.9: Mock data layer toggle (IS_DEPLOYED)

### Phase 3: Integration
- Task 3.1: live_e2e.mjs — submit + poll + verify
- Task 3.2: Browser walkthrough via Playwright
- Task 3.3: Benchmark report

### Phase 4: Deploy
- Task 4.1: Deploy studionet
- Task 4.2: Browser-verify on studionet
- Task 4.3: Deploy bradbury
- Task 4.4: Browser-verify on bradbury

### Phase 5: Docs
- Task 5.1: README.md
- Task 5.2: ARCHITECTURE.md
- Task 5.3: DEPLOYMENT.md
- Task 5.4: BENCHMARKS.md

---

## Benchmarks (self-imposed)

| Metric | Target | Verification |
|---|---|---|
| Contract unit tests | 100% pass | `pytest tests/direct` |
| Deploy status | ACCEPTED + MAJORITY_AGREE | receipt log |
| E2E submit→verdict on studionet | < 90s | live_e2e.mjs timing |
| Frontend a11y | WCAG AA (contrast ≥ 4.5:1 body) | impeccable audit |
| Frontend mobile responsive | all breakpoints | visual QA |
| 3D performance | ≥ 30fps on integrated GPU | browser FPS counter |
| Indexed codebase | searchable | codebase-memory-mcp list |
| Honest submit UI | no fake "consensus reached" timer | code review |
| 0 instances of `int`/`dict`/`list` in storage annotations | grep | `grep -nE "int\|dict\|list" contracts/pyre.py` |
| All web/LLM calls in try/except | grep | code review |