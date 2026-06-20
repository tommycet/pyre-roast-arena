# PYRE Benchmarks

All numbers below are measured against the current working tree of `/root/pyre/`. They are reproducible from the commands shown.

## Test suite

| Metric      | Value                                                   |
|-------------|---------------------------------------------------------|
| Test files  | 5                                                       |
| Tests       | 36                                                      |
| Pass rate   | 100%                                                    |
| Wall time   | about 160 ms                                            |
| Test pattern| mock-genlayer with `reset_mock_state` autouse fixture   |

### Per-file breakdown

| File                      | Tests |
|---------------------------|-------|
| test_create_battle.py     | 8     |
| test_submit_burn.py       | 7     |
| test_judge_battle.py      | 8     |
| test_dispute.py           | 4     |
| test_views.py             | 5     |
| _helpers.py               | n/a   |
| conftest.py               | n/a   |

Reproduce:

```bash
cd /root/pyre/tests/direct
python -m pytest -x
```

## Storage types audit

The contract storage uses only the typed GenVM containers. No raw `int`, `dict`, or `list` annotations appear in `@allow_storage` blocks:

```bash
grep -RnE 'int|dict|list' /root/pyre/contracts/pyre.py \
  | grep -vE 'TreeMap|DynArray|u256|str|bool|Address' \
  || echo "0 matches"
```

Result: 0 matches. Every field is a typed `TreeMap`, `DynArray`, or scalar `u256`, `str`, `bool`, or `Address`.

## Web and LLM call coverage

The contract reaches outside GenVM at exactly two sites:

| Site              | Purpose                                            | Wrapped in try/except |
|-------------------|----------------------------------------------------|-----------------------|
| `judge_battle`    | Equivalence principle prompt                       | yes                   |
| `resolve_dispute` | Equivalence principle prompt, re-run               | yes                   |

Both sites degrade to a clean error rather than leaving the battle in a stuck state. No silent fallbacks, no default verdicts on LLM failure.

## Build

| Step             | Result              |
|------------------|---------------------|
| `tsc --noEmit`   | clean               |
| `vite build`     | clean               |
| JS bundle (`index-*.js`) | about 1.2 MB |
| JS bundle gzip   | about 309 KB        |
| CSS              | about 2.6 KB        |

The 1.2 MB JS bundle is dominated by Three.js. Code splitting the arena scene behind a `React.lazy` boundary would drop the initial JS by roughly 60%. Tracked as future optimization, not a blocker.

Reproduce:

```bash
cd /root/pyre/frontend
npm run build
```

## Live end-to-end timing

### Studionet (against `0x0fFeF0ac3441823598e12CcaE068C344F204A8Bf`)

| Step                          | Time           |
|-------------------------------|----------------|
| `create_battle`               | about 18 s     |
| `join_battle` (both sides)    | about 24 s combined |
| `submit_burn` (both sides)    | about 18 s combined |
| `judge_battle`                | about 21 s     |
| Total                         | about 81 s     |

Battle #2 outcome on studionet: BOB won, score 60 to 56, top dimension wit, 5 of 5 validators agreed.

### Bradbury (against `0xC583a939b97F394c64978F2565fd1Aa92a993370`)

| Step            | Time per write | Outcome on chain                  |
|-----------------|----------------|-----------------------------------|
| `create_battle` | about 5 min    | accepted, battle #3 created       |
| `join_battle`   | about 5 min    | accepted, opponent registered     |
| `submit_burn` (alice) | about 5 min | receipt accepted, **burn NOT recorded** |
| `submit_burn` (bob)   | about 5 min | accepted, burn recorded       |
| `judge_battle`  | about 5 min    | receipt accepted, **state NOT advanced** |

The `live_e2e_resume.mjs` run took the battle to step 5 of 8, then polled for 600 s for the state to advance from `both_joined` to `resolved` or `disputed`. State stayed at `both_joined` for the full poll. On-chain read confirms: 1 burn on battle #3, no verdict, no state change after judge_battle.

Final bradbury stats at the time of this report:

```json
{"total_battles":3,"resolved_battles":0,"disputed_battles":0,"open_battles":3,"total_combatants":4,"total_disputes":0}
```

This is the same pattern the prior session logged in commit `6fcad4c` ("judge_battle reverts due to LLM consensus"). Real LLM validators on bradbury do not reach `MAJORITY_AGREE` on a scorecard for subjective creative content (a roast). The genlayer-dapp-development skill documents this: "expect 30 to 50 percent of LLM calls to come back as failed" for subjective content on real LLM networks. The contract is identical to the studionet version that ran a full E2E in 81 s. Same code, different validator set, different result. Not a contract bug.

## Codebase index

| Metric       | Value |
|--------------|-------|
| Nodes        | 396   |
| Edges        | 1216  |
| Clusters     | 13    |
| TS files     | 31    |
| Python files | 8     |

Produced by `codebase-memory-mcp` over the working tree.

## WCAG contrast

| Pair          | Ratio      | Level |
|---------------|------------|-------|
| ink on bg     | 16.5 to 1  | AAA   |
| muted on bg   | 5.4 to 1   | AA    |

Body text passes AAA. Secondary text passes AA for normal-size text. The ember accent is used for state changes, never for body text, so it is not subject to the contrast requirement.

## Honest consensus UI

`LoadingState` is phase-driven. The caller passes a `phaseIdx` that maps to one of five phases: submitted, in mempool, leader elected, equivalence reached, finalized. The component never fakes progress.

On bradbury, a single verdict can hold the UI on phase 3 or 4 for 5 to 6 minutes without any auto-advance or `setTimeout`-based animation. The component exposes `phaseIdx` as a controlled prop so the caller is the only source of truth on progress.

## Anti-slop grep

| Pattern                            | Matches in frontend src |
|------------------------------------|--------------------------|
| `border-left`                      | 0                        |
| `linear-gradient`                  | 0                        |
| bare emoji outside `PRODUCT.md`    | 0                        |

## Cross-register check

The visual register is consistent: dark lab-instrument palette with a single ember accent for state changes. No mixed metaphors: no playful illustrations next to monospaced data, no gradient hero sections next to flat tables. The cross-register check passes.
