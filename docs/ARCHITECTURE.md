# PYRE Architecture

## Storage model

The contract uses five `@allow_storage` `@dataclass` entities plus three flat maps and two scalar counters.

### Entities

| Entity     | Fields |
|------------|--------|
| `Battle`   | id, creator, slot_a, slot_b, prompt, fee, state, both_joined_at, both_burned_at, judging_started_at, resolved_at |
| `Combatant`| address, name, reputation, battles, wins, losses, draws, personal_best, joined_at |
| `Burn`     | battle_id, slot, lines, submitted_at, author |
| `Verdict`  | battle_id, scores, winner, reasoning, decided_at, validator_round |
| `Dispute`  | id, battle_id, raiser, reason, status, resolution, new_verdict, created_at |

### Maps and counters

```
battles:         TreeMap[u256, Battle]
combatants:      TreeMap[str, Combatant]
disputes:        TreeMap[u256, Dispute]
burns:           TreeMap[u256, Burn]   # flat, keyed by battle_id*2+slot
battle_counter:  u256
dispute_counter: u256
```

### Flat burn key trick

The naive shape is `TreeMap[u256, DynArray[Burn, 2]]` per battle, but `DynArray[T]()` cannot be user-instantiated in the current GenVM. The contract instead flattens both slots into a single key:

```
key(battle_id, slot) = battle_id * 2 + slot   # slot in {0, 1}
```

Read `burns[battle_id * 2 + 0]` for slot A and `burns[battle_id * 2 + 1]` for slot B. This sidesteps the DynArray instantiation problem and keeps both burns addressable by a single u256. It is the same pattern used to make `DynArray[Burn]()` work without ever calling that constructor.

## Public surface

| Method                | Args                          | Returns        |
|-----------------------|-------------------------------|----------------|
| `create_battle`       | prompt: str, fee: u256        | battle_id: u256 |
| `join_battle`         | battle_id: u256               | bool           |
| `submit_burn`         | battle_id: u256, slot: u256, lines: str | bool   |
| `judge_battle`        | battle_id: u256               | verdict: dict  |
| `raise_dispute`       | battle_id: u256, reason: str  | dispute_id: u256 |
| `resolve_dispute`     | dispute_id: u256              | verdict: dict  |
| `get_battle`          | battle_id: u256               | Battle         |
| `get_burn`            | battle_id: u256, slot: u256   | Burn           |
| `get_combatant`       | address: str                  | Combatant      |
| `list_open_battles`   | limit: u256                   | list[Battle]   |
| `list_recent_battles` | limit: u256                   | list[Battle]   |

Six write methods, five view methods. Writes run consensus and pay gas (or are gas-free on studionet). Views are local reads.

## Method-to-storage touchpoints

| Method                | Reads                                                       | Writes                                                                  |
|-----------------------|-------------------------------------------------------------|-------------------------------------------------------------------------|
| `create_battle`       | `battle_counter`                                            | `battles`, `battle_counter`                                             |
| `join_battle`         | `battles`                                                   | `battles`                                                               |
| `submit_burn`         | `battles`                                                   | `burns`, `battles`                                                      |
| `judge_battle`        | `battles`, `burns`, `combatants`                            | `battles`, `verdicts`, `combatants`                                     |
| `raise_dispute`       | `battles`                                                   | `disputes`, `dispute_counter`, `battles`                                |
| `resolve_dispute`     | `disputes`, `battles`, `burns`, `combatants`                | `disputes`, `verdicts`, `combatants`, `battles`                         |
| `get_battle`          | `battles`                                                   | none                                                                    |
| `get_burn`            | `burns`                                                     | none                                                                    |
| `get_combatant`       | `combatants`                                                | none                                                                    |
| `list_open_battles`   | `battles`                                                   | none                                                                    |
| `list_recent_battles` | `battles`                                                   | none                                                                    |

`Combatant` rows are upserted on first sight. Reputation is read inside `judge_battle` and `resolve_dispute` and applied as a delta to the existing row, never replaced wholesale.

## Equivalence principle

`judge_battle` and `resolve_dispute` both run an LLM through `gl.eq_principle.prompt_non_comparative`. The prompt must:

1. Score both burns independently on five named dimensions, each on a 0 to 10 scale.
2. Pick a winner (slot A, slot B, or draw) only from the resulting scores.
3. Return strict JSON, no prose outside the JSON block, no markdown fences, no trailing commentary.

The non-comparative framing forces each validator to grade in isolation. Equivalence is reached on the JSON shape, not on the prose, which is what the validators actually compare. Two validators that score 9-7-8-6-7 and 9-7-8-6-8 produce equivalent outputs even if their free-text reasoning differs, and that is the property the protocol needs.

### Five-dimension judging schema

| Dimension  | Definition                                          | Scale    |
|------------|-----------------------------------------------------|----------|
| wit        | Cleverness of wordplay and surprise                 | 0 to 10  |
| originality| Novelty relative to standard battle tropes          | 0 to 10  |
| burn       | Direct hit on the opponent's argument or image      | 0 to 10  |
| rhyme      | Internal and end rhyme density, scheme, multis      | 0 to 10  |
| topicality | On-prompt, on-theme, on the other burn              | 0 to 10  |

Total score is the sum across the five dimensions. Maximum is 50. Top dimension in the live studionet battle #2 was wit.

## Why non-comparative over comparative

A comparative prompt would say "compare burn A and burn B and pick the winner". A non-comparative prompt says "score burn A on five dimensions, then score burn B on the same five dimensions, then derive a winner from those scores".

The non-comparative form is what makes validators produce equivalent outputs without coordinating. If validator 1 sees burn A first and validator 2 sees burn B first, their comparative reasoning can drift even when their scores are identical. Scoring each burn independently removes the ordering effect.

The trade-off is that non-comparative scoring can miss head-to-head dynamics (a burn that is a direct rebuttal of the other only matters in context). PYRE accepts that trade-off because equivalence stability is more important than peak judging quality for a demo contract.

The `topicality` dimension is the partial workaround: it asks each validator to score how on-point each burn is with respect to the other, which captures some of the rebuttal signal without forcing the validator into a comparative framing.

## Reputation math

| Outcome | Delta |
|---------|-------|
| Win     | +5    |
| Loss    | -2    |
| Draw    | +1    |

Starting reputation is 50. Reputation is clamped to `[0, 100]` after every adjustment. Each combatant also tracks `personal_best`, the highest reputation they have ever held. `personal_best` never decays and is unaffected by losses.

## State machine

```
open
  |
  v   join_battle called for slot B
both_joined
  |
  v   both submit_burn calls land
both_burned
  |
  v   judge_battle called
judging
  |
  +--> resolved   (final verdict stored, reputation updated)
  |
  +--> disputed   (raise_dispute called instead)
                  |
                  v   resolve_dispute runs a fresh LLM round
                resolved
```

Terminal state is `resolved`. There is no path back to `open` from `resolved`.

## Dispute and re-judging

1. Any combatant in a resolved battle calls `raise_dispute(battle_id, reason)`. The contract writes a `Dispute` row and transitions the battle from `resolved` back to `disputed`.
2. The contract schedules `resolve_dispute(dispute_id)`. This call runs the equivalence principle prompt a second time with a fresh random seed and the original two burns plus the dispute reason.
3. If the new verdict differs from the original, the new verdict overwrites the old one, reputation is recomputed and applied as a delta over the previous state, and the dispute is marked resolved with the new verdict recorded.
4. If the new verdict matches the original, the dispute is marked resolved without further changes. The combatant pays the LLM cost but the standings do not move.

## Frontend

### Pages

| Page        | Purpose                                     |
|-------------|---------------------------------------------|
| Home        | Landing, hero, recent battles               |
| Arena       | Browse open and recent battles              |
| Battle      | Live battle view, score breakdown           |
| Submit      | Burn submission form                        |
| Flame       | Combatant profile, reputation, history      |
| Combatant   | Same as Flame (alias route)                 |
| Dispute     | Open and resolved disputes                  |

### Design system

Ten or more primitives: `Button`, `Input`, `Card`, `StatusPill`, `LoadingState`, `EmptyState`, `ErrorState`, `Modal`, `Tabs`, `Toast`. Dark OKLCH palette:

| Token   | Value                       | Contrast against bg |
|---------|-----------------------------|---------------------|
| bg      | `oklch(0.10 0.005 270)`     | n/a                 |
| ink     | `oklch(0.96 0.005 270)`     | 16.5 to 1 (AAA)     |
| ember   | `oklch(0.72 0.18 50)`       | accent only         |
| muted   | `oklch(0.62 0.01 270)`      | 5.4 to 1 (AA)       |

### Three.js arena

The arena scene runs ember particles as a `Points` field plus a winner-rises, loser-sinks camera tween keyed to the verdict. When a battle resolves, the loser drops below the floor and the winner floats up while embers swarm toward them. The scene is mounted by `Arena.tsx` and tears down on route change to avoid leaking WebGL contexts.

## Service layer

`frontend/src/services/pyre.ts` is 297 lines and exposes five view methods plus six write methods. Reads use TanStack Query hooks. Writes use mutation hooks that surface transaction hashes and receipt status.

### Mock vs live toggle

The service reads `import.meta.env.VITE_IS_DEPLOYED`. When unset or `false`, all calls resolve from an in-memory mock that mirrors the contract state machine. When `true`, calls route through `genlayer-js` to the configured network. The mock is what the unit tests and the local dev server use. Network selection (studionet vs bradbury) is independent and is driven by `VITE_NETWORK`.

## Honest consensus-wait UI

`LoadingState` renders a phase list driven by `phaseIdx`, a numeric prop the caller increments as the write progresses. It is not a fake animated stepper that pretends consensus is faster than it is. The actual phases are:

1. Submitted (tx hash known)
2. In mempool (peer saw the tx)
3. Leader elected (validator picked)
4. Equivalence reached (JSON shape agreed)
5. Finalized (receipt on chain)

On studionet the full sequence runs in about 81 seconds. On bradbury with the real LLM, a single verdict takes 5 to 6 minutes and the UI must not collapse those phases into a spinner. The component has no `setTimeout` based auto-advance and no fake progress bar.

## Web and LLM call sites

The contract reaches outside GenVM at exactly two sites:

1. `judge_battle` (around line 250): runs the equivalence principle prompt.
2. `resolve_dispute` (around line 440): runs the equivalence principle prompt a second time.

Both are wrapped in `try / except` so a transient LLM outage degrades to a clean error rather than a stuck battle. The contract never silently falls back to a default verdict.

## Error paths

Every write method raises `Exception("message")` (plain Python exception, not `gl.UserError`, see `docs/DEPLOYMENT.md` gotcha 1) on a precondition failure. The contract does not distinguish between user errors and system errors at the call site. The validators surface the message string back to the caller as a `REVERTED` status with the message in the receipt.

Precondition failures by method:

| Method            | Triggers                                                                |
|-------------------|-------------------------------------------------------------------------|
| `create_battle`   | prompt empty, fee below minimum, sender reentering own battle           |
| `join_battle`     | battle not in `open` state, sender already joined a slot               |
| `submit_burn`     | battle not in `both_joined`, sender not the combatant for that slot     |
| `judge_battle`    | battle not in `both_burned`, both burns not present                     |
| `raise_dispute`   | battle not in `resolved`, sender not a combatant in this battle         |
| `resolve_dispute` | dispute already resolved, battle already re-judged                      |

## Frontend-to-contract call mapping

| Frontend page   | Contract calls                                                    |
|-----------------|-------------------------------------------------------------------|
| Home            | `list_recent_battles`                                             |
| Arena           | `list_open_battles`, `list_recent_battles`                        |
| Battle          | `get_battle`, `get_burn` (x2), `get_combatant` (x2)               |
| Submit          | `get_battle`, `submit_burn`                                       |
| Flame/Combatant | `get_combatant`, `list_recent_battles`                            |
| Dispute         | `get_battle`, `get_burn` (x2), `raise_dispute`                    |

The Arena page polls `list_open_battles` every 15 seconds while focused. The Battle page polls `get_battle` every 5 seconds while the battle is in `judging` state, then stops once it sees `resolved`.

## Codebase index

The codebase is indexed through `codebase-memory-mcp`:

| Metric       | Value |
|--------------|-------|
| Nodes        | 396   |
| Edges        | 1216  |
| Clusters     | 13    |
| TS files     | 31    |
| Python files | 8     |

## Out of scope

PYRE deliberately does not implement these. Each is an obvious extension but was cut to keep the contract small enough to audit.

| Feature                    | Why it is out                                              |
|----------------------------|------------------------------------------------------------|
| Authentication / identity  | GenLayer uses `msg.sender` directly; no off-chain auth     |
| Leaderboards / seasons     | Reputation per combatant is enough for ranking             |
| Tournaments                | A tournament bracket is just chained battles, not new code |
| Spectator betting          | Adds a second consensus round without new equivalence tests |
| Off-chain burn drafts      | The frontend holds drafts in memory; the contract stores submitted burns only |
| On-chain comments / voting | Adds storage writes that do not affect the verdict         |
| Multi-judge panels         | The equivalence principle already aggregates multiple LLM validators |

If you fork PYRE and add one of these, the storage model in `docs/ARCHITECTURE.md` is the place to start: most of these features need a new `TreeMap` and one or two new public methods.
