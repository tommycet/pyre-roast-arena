# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""PYRE — Roast Battle Arena on GenLayer.

Architecture
------------
Two combatants enter roasts on a shared topic. AI validator consensus (via
`gl.eq_principle.prompt_non_comparative`) judges each burn on five dimensions:
    wit (0-20)         originality / cleverness of the angle
    originality (0-20)  not a stock joke, fresh material
    burn (0-20)        how much it actually lands as an insult
    rhyme (0-20)       prosody / punch (if applicable, else 10 for prose)
    topicality (0-20)  on-topic and tied to the submitted context_url if given

The higher-scoring combatant wins. Tied scores = draw. Verdict is committed
on-chain and visible in the registry. Anyone can raise a dispute; disputes are
re-judged by a fresh consensus pass.

Storage types
-------------
STRICT — GenVM rejects plain int/dict/list. Use:
  u256 / u64 / bigint for integers
  TreeMap[K, V] with fully-instantiated types
  DynArray[T] for lists
  @allow_storage @dataclass for nested objects
  str for addresses (typed as Address when used as a parameter)
"""
from __future__ import annotations

import json
from dataclasses import dataclass

from genlayer import (
    Address,
    DynArray,
    TreeMap,
    allow_storage,
    gl,
    u256,
)


# ---------------------------------------------------------------------------
# Storage dataclasses — every stored object MUST be @allow_storage @dataclass
# with sized-int fields and fully-instantiated generic containers.
# ---------------------------------------------------------------------------

@allow_storage
@dataclass
class Combatant:
    """A registered combatant profile. Keyed by wallet address."""

    addr: str
    wins: u256
    losses: u256
    draws: u256
    reputation: u256         # 0-100, derived from win rate + dispute history
    total_burns: u256
    best_score: u256         # personal best single-burn score (0-100)
    best_score_battle: u256  # battle id where best_score was set


@allow_storage
@dataclass
class Burn:
    """A single submitted roast within a battle."""

    combatant: str           # address
    text: str                # the burn itself
    context_url: str         # optional reference URL the burn responds to
    wit: u256
    originality: u256
    burn: u256
    rhyme: u256
    topicality: u256
    total: u256              # sum of five dimensions, 0-100
    submitted_at: u256       # unix timestamp


@allow_storage
@dataclass
class Verdict:
    """The AI judges' final verdict for a battle."""

    battle_id: u256
    winner: str              # address of winner, or "0xDRAW" on tie
    loser: str               # address of loser, or "0xDRAW" on tie
    margin: u256             # |winner_score - loser_score|, 0-100
    reasoning: str           # judge summary, <= 800 chars
    judged_at: u256
    judge_count: u256        # how many LLM validators agreed (3-5)


@allow_storage
@dataclass
class Dispute:
    """A raised dispute against a verdict."""

    id: u256
    battle_id: u256
    raised_by: str           # address
    reason: str              # <= 280 chars
    raised_at: u256
    status: str              # "open" | "upheld" | "overturned"
    prior_winner: str        # winner recorded at raise time, to detect flip
    resolved_at: u256        # 0 if unresolved


@allow_storage
@dataclass
class Battle:
    """A roast battle between two combatants on a shared topic."""

    id: u256
    topic: str
    creator: str             # address of combatant 1 (battle creator)
    opponent: str            # address of combatant 2 (empty string = open duel)
    state: str               # "open" | "both_joined" | "both_burned"
                              # | "judging" | "resolved" | "disputed"
    burn_count: u256         # how many burns submitted (0..2)
    verdict: Verdict         # zero-verdict when unresolved
    created_at: u256
    stake: u256              # GEN staked by both (creator + opponent match)


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------

class Pyre(gl.Contract):
    """Roast battle arena.

    Public surface:
      create_battle(topic, stake)         -> u256 (battle_id)
      join_battle(battle_id)              -> None
      submit_burn(battle_id, text, url)   -> None
      judge_battle(battle_id)             -> u256 (verdict_id == battle_id)
      raise_dispute(battle_id, reason)    -> u256 (dispute_id)
      resolve_dispute(dispute_id)         -> None
      get_battle(battle_id)               -> str (json)
      get_recent_battles(limit, offset)   -> str (json)
      get_combatant(addr)                 -> str (json)
      get_dispute(dispute_id)             -> str (json)
      get_stats()                         -> str (json)
    """

    # Persistent storage — STRICT types only.
    battles: TreeMap[u256, Battle]
    burns: TreeMap[u256, Burn]            # keyed by (battle_id * 2 + slot) for stable ordering
    combatants: TreeMap[str, Combatant]
    disputes: TreeMap[u256, Dispute]
    battle_counter: u256
    dispute_counter: u256

    # Class-level constants (NOT stored — these are class attrs, no `self.`).
    ENTRY_FEE = 10**16                         # 0.01 GEN per combatant (plain int — class attr, not stored)
    MAX_BURN_LEN = 500
    MAX_TOPIC_LEN = 120
    MAX_REASON_LEN = 280
    JUDGING_TIMEOUT_S = 60 * 30               # 30 min
    REPUTATION_DELTA_WIN = 5
    REPUTATION_DELTA_LOSS = 2
    REPUTATION_DELTA_DRAW = 1
    REPUTATION_FLOOR = 0
    REPUTATION_CEIL = 100

    def __init__(self) -> None:
        # ONLY scalar fields in __init__. TreeMap/DynArray are auto-created
        # by GenVM (mock tests must do it manually).
        self.battle_counter = u256(0)
        self.dispute_counter = u256(0)

    # -----------------------------------------------------------------------
    # Burn access helpers — burns live in a flat TreeMap keyed by (battle_id*2+slot)
    # so they can be persisted without explicit DynArray construction.
    # -----------------------------------------------------------------------

    def _burn_key(self, battle_id: u256, slot: u256) -> u256:
        return u256(int(battle_id) * 2 + int(slot))

    def _get_burns(self, battle_id: u256) -> list[Burn]:
        out: list[Burn] = []
        for slot in (0, 1):
            b = self.burns.get(self._burn_key(battle_id, slot))
            if b is not None:
                out.append(b)
        return out

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    def _now(self, timestamp: int = 0) -> u256:
        # Fully deterministic: never depends on system clock; only contract state
        if timestamp > 0:
            return u256(timestamp)
        return u256(1720000000 + int(self.battle_count or 0) * 86400)

    def _get_combatant(self, addr: str) -> Combatant:
        """Fetch combatant; create a zeroed profile if new."""
        existing = self.combatants.get(addr)
        if existing is None:
            return Combatant(
                addr=addr,
                wins=u256(0),
                losses=u256(0),
                draws=u256(0),
                reputation=u256(50),       # neutral start
                total_burns=u256(0),
                best_score=u256(0),
                best_score_battle=u256(0),
            )
        return existing

    def _save_combatant(self, c: Combatant) -> None:
        self.combatants[c.addr] = c

    def _empty_verdict(self, battle_id: u256) -> Verdict:
        return Verdict(
            battle_id=battle_id,
            winner="",
            loser="",
            margin=u256(0),
            reasoning="",
            judged_at=u256(0),
            judge_count=u256(0),
        )

    def _parse_score_json(self, raw: str) -> dict:
        """Robust JSON parse for LLM output. Strips markdown fences and
        surrounding prose; falls back to zero scores on malformed output."""
        cleaned = (raw or "").strip()
        if not cleaned:
            return self._zero_scores()
        if cleaned.startswith("```"):
            parts = cleaned.split("```")
            if len(parts) >= 2:
                cleaned = parts[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
                cleaned = cleaned.strip()
        if not cleaned.startswith("{"):
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start != -1 and end != -1 and end > start:
                cleaned = cleaned[start : end + 1]
        try:
            data = json.loads(cleaned)
            if not isinstance(data, dict):
                return self._zero_scores()
            return data
        except Exception:
            return self._zero_scores()

    def _zero_scores(self) -> dict:
        return {
            "wit": 0,
            "originality": 0,
            "burn": 0,
            "rhyme": 0,
            "topicality": 0,
            "total": 0,
            "reasoning": "",
        }

    def _clamp_score(self, v: int) -> int:
        return max(0, min(20, int(v)))

    # -----------------------------------------------------------------------
    # Battle lifecycle
    # -----------------------------------------------------------------------

    @gl.public.write
    def create_battle(self, topic: str, stake: u256) -> u256:
        """Open a new duel on `topic` with the sender as combatant 1."""
        topic = (topic or "").strip()
        if len(topic) == 0:
            raise Exception("topic required")
        if len(topic) > int(self.MAX_TOPIC_LEN):
            raise Exception(f"topic must be <= {int(self.MAX_TOPIC_LEN)} chars")
        if int(stake) > int(self.ENTRY_FEE) * 1000:
            raise Exception("stake exceeds sane upper bound")

        self.battle_counter = u256(int(self.battle_counter) + 1)
        bid = self.battle_counter

        battle = Battle(
            id=bid,
            topic=topic,
            creator=str(gl.message.sender_address),
            opponent="",
            state="open",
            burn_count=u256(0),
            verdict=self._empty_verdict(bid),
            created_at=self._now(),
            stake=stake,
        )
        self.battles[bid] = battle

        # Ensure creator has a profile.
        self._save_combatant(self._get_combatant(str(gl.message.sender_address)))
        return bid

    @gl.public.write
    def join_battle(self, battle_id: u256) -> None:
        """Join an open battle as combatant 2."""
        battle = self.battles.get(battle_id)
        if battle is None:
            raise Exception("battle not found")
        if battle.state != "open":
            raise Exception("battle is not open")
        if battle.creator == gl.message.sender_address:
            raise Exception("cannot join your own battle")
        battle.opponent = str(gl.message.sender_address)
        battle.state = "both_joined"
        self.battles[battle_id] = battle
        self._save_combatant(self._get_combatant(str(gl.message.sender_address)))

    @gl.public.write
    def submit_burn(self, battle_id: u256, burn_text: str, context_url: str) -> None:
        """Submit a roast in the battle. Only combatants may submit, only once."""
        battle = self.battles.get(battle_id)
        if battle is None:
            raise Exception("battle not found")
        if battle.state not in ("both_joined",):
            raise Exception("battle is not in submission phase")
        sender = str(gl.message.sender_address)
        if sender not in (battle.creator, battle.opponent):
            raise Exception("only combatants may submit")
        for existing in self._get_burns(battle_id):
            if existing.combatant == sender:
                raise Exception("combatant has already submitted")

        text = (burn_text or "").strip()
        if len(text) == 0:
            raise Exception("burn text required")
        if len(text) > int(self.MAX_BURN_LEN):
            raise Exception(f"burn must be <= {int(self.MAX_BURN_LEN)} chars")

        # Pre-fill scoring with zeros; judge_battle populates after consensus.
        slot = u256(int(battle.burn_count))
        burn = Burn(
            combatant=sender,
            text=text,
            context_url=(context_url or "").strip(),
            wit=u256(0),
            originality=u256(0),
            burn=u256(0),
            rhyme=u256(0),
            topicality=u256(0),
            total=u256(0),
            submitted_at=self._now(),
        )
        self.burns[self._burn_key(battle_id, slot)] = burn
        battle.burn_count = u256(int(battle.burn_count) + 1)

        # If both combatants have submitted, mark as ready for judging.
        if int(battle.burn_count) >= 2:
            battle.state = "both_burned"
        self.battles[battle_id] = battle

        c = self._get_combatant(sender)
        c.total_burns = u256(int(c.total_burns) + 1)
        self._save_combatant(c)

    # -----------------------------------------------------------------------
    # AI judging
    # -----------------------------------------------------------------------

    @gl.public.write
    def judge_battle(self, battle_id: u256) -> u256:
        """Trigger AI validator consensus to judge the battle. Returns battle_id
        (verdict is stored on the battle itself)."""
        battle = self.battles.get(battle_id)
        if battle is None:
            raise Exception("battle not found")
        if battle.state not in ("both_burned",):
            raise Exception("battle is not ready to judge")
        if battle.burn_count < u256(2):
            raise Exception("need two burns to judge")

        battle.state = "judging"
        self.battles[battle_id] = battle

        # Score each burn via non-comparative consensus. The leader produces
        # the scorecard; validators check it against criteria.
        scored: list[Burn] = []
        for slot in (0, 1):
            b = self.burns.get(self._burn_key(battle_id, u256(slot)))
            if b is None:
                continue
            scorecard = self._score_burn(battle, b)
            scored.append(self._apply_scorecard(b, scorecard))
            self.burns[self._burn_key(battle_id, u256(slot))] = scored[-1]
        # The original two burns, in their original order.
        b0, b1 = scored[0], scored[1]
        s0 = int(b0.total)
        s1 = int(b1.total)

        if s0 == s1:
            winner, loser = "0xDRAW", "0xDRAW"
            margin = 0
        elif s0 > s1:
            winner, loser = b0.combatant, b1.combatant
            margin = s0 - s1
        else:
            winner, loser = b1.combatant, b0.combatant
            margin = s1 - s0

        # Build reasoning from the leader's scorecards.
        reasoning = self._compose_reasoning(b0, b1, winner)

        battle.verdict = Verdict(
            battle_id=battle_id,
            winner=winner,
            loser=loser,
            margin=u256(margin),
            reasoning=reasoning[:800],
            judged_at=self._now(),
            judge_count=u256(3),  # default studionet count
        )
        battle.state = "resolved"
        self.battles[battle_id] = battle

        # Update reputation + records.
        self._apply_verdict_to_combatants(battle, winner, loser, s0, s1)
        return battle_id

    def _score_burn(self, battle: Battle, burn: Burn) -> dict:
        """Score a single burn via non-comparative consensus. Returns dict with
        wit, originality, burn, rhyme, topicality, total, reasoning."""

        def _score() -> str:
            context_section = ""
            if burn.context_url:
                try:
                    fetched = gl.nondet.web.render(burn.context_url, mode="text")
                    context_section = (
                        f"\n\nCONTEXT (the URL the burn responds to):\n"
                        f"{str(fetched)[:1500]}"
                    )
                except Exception as exc:
                    context_section = (
                        f"\n\nCONTEXT: <failed to fetch: {exc}>"
                    )

            prompt = f"""You are a roast battle judge. Score ONE burn on five dimensions, each 0-20. Total is sum (0-100).

BATTLE TOPIC: {battle.topic}

COMBATANT BURN:
\"\"\"{burn.text}\"\"\"{context_section}

DIMENSIONS:
  wit         — cleverness, wordplay, sharpness of the angle (0-20)
  originality — not a stock joke, fresh material (0-20)
  burn        — how hard it lands as an actual insult (0-20)
  rhyme       — prosody, punch, rhythm. If it's prose, give credit for cadence (0-20)
  topicality  — ties back to the BATTLE TOPIC and the CONTEXT URL when provided (0-20)

OUTPUT STRICT JSON ONLY. NO prose, NO markdown fences. Exact shape:
{{"wit":N,"originality":N,"burn":N,"rhyme":N,"topicality":N,"total":N,"reasoning":"<one sentence, max 240 chars>"}}

Sum N for the five scores MUST equal `total`. Reasoning must be a single sentence.
"""
            return gl.nondet.exec_prompt(prompt)

        result = gl.eq_principle.prompt_non_comparative(
            _score,
            task="Score a single roast battle burn on five 0-20 dimensions.",
            criteria=(
                "Output must be strict JSON with integer fields "
                "wit, originality, burn, rhyme, topicality, total, and a string "
                "reasoning (max 240 chars). Each of the five scores must be in "
                "[0,20]. The `total` field must equal the sum of the five scores. "
                "Reasoning must be one sentence."
            ),
        )
        return self._parse_score_json(str(result))

    def _apply_scorecard(self, burn: Burn, scorecard: dict) -> Burn:
        return Burn(
            combatant=burn.combatant,
            text=burn.text,
            context_url=burn.context_url,
            wit=u256(self._clamp_score(int(scorecard.get("wit", 0)))),
            originality=u256(self._clamp_score(int(scorecard.get("originality", 0)))),
            burn=u256(self._clamp_score(int(scorecard.get("burn", 0)))),
            rhyme=u256(self._clamp_score(int(scorecard.get("rhyme", 0)))),
            topicality=u256(self._clamp_score(int(scorecard.get("topicality", 0)))),
            total=u256(int(scorecard.get("total", 0))),
            submitted_at=burn.submitted_at,
        )

    def _compose_reasoning(self, b0: Burn, b1: Burn, winner: str) -> str:
        if winner == "0xDRAW":
            return f"Draw. Both scorched at {int(b0.total)}-{int(b1.total)}."
        if winner == b0.combatant:
            return (
                f"Winner scored {int(b0.total)} vs {int(b1.total)}. "
                f"Top dimension: {self._top_dim(b0)}."
            )
        return (
            f"Winner scored {int(b1.total)} vs {int(b0.total)}. "
            f"Top dimension: {self._top_dim(b1)}."
        )

    def _top_dim(self, b: Burn) -> str:
        dims = {
            "wit": int(b.wit),
            "originality": int(b.originality),
            "burn": int(b.burn),
            "rhyme": int(b.rhyme),
            "topicality": int(b.topicality),
        }
        return max(dims, key=lambda k: dims[k])

    def _apply_verdict_to_combatants(
        self, battle: Battle, winner: str, loser: str, s0: int, s1: int
    ) -> None:
        a = self._get_combatant(battle.creator)
        b = self._get_combatant(battle.opponent)

        # Track personal bests.
        if s0 > int(a.best_score):
            a.best_score = u256(s0)
            a.best_score_battle = battle.id
        if s1 > int(b.best_score):
            b.best_score = u256(s1)
            b.best_score_battle = battle.id

        if winner == "0xDRAW":
            a.draws = u256(int(a.draws) + 1)
            b.draws = u256(int(b.draws) + 1)
            self._bump_reputation(a, int(self.REPUTATION_DELTA_DRAW))
            self._bump_reputation(b, int(self.REPUTATION_DELTA_DRAW))
        else:
            # Identify winner/loser combatants.
            if winner == a.addr:
                win_c, lose_c = a, b
            else:
                win_c, lose_c = b, a
            win_c.wins = u256(int(win_c.wins) + 1)
            lose_c.losses = u256(int(lose_c.losses) + 1)
            self._bump_reputation(win_c, int(self.REPUTATION_DELTA_WIN))
            self._bump_reputation(lose_c, -int(self.REPUTATION_DELTA_LOSS))

        self._save_combatant(a)
        self._save_combatant(b)

    def _bump_reputation(self, c: Combatant, delta: int) -> None:
        new_score = int(c.reputation) + delta
        clamped = max(int(self.REPUTATION_FLOOR), min(int(self.REPUTATION_CEIL), new_score))
        c.reputation = u256(clamped)

    # -----------------------------------------------------------------------
    # Disputes
    # -----------------------------------------------------------------------

    @gl.public.write
    def raise_dispute(self, battle_id: u256, reason: str) -> u256:
        """Raise a dispute against a battle's verdict."""
        battle = self.battles.get(battle_id)
        if battle is None:
            raise Exception("battle not found")
        if battle.state != "resolved":
            raise Exception("only resolved battles can be disputed")
        reason = (reason or "").strip()
        if len(reason) == 0:
            raise Exception("reason required")
        if len(reason) > int(self.MAX_REASON_LEN):
            raise Exception(f"reason must be <= {int(self.MAX_REASON_LEN)} chars")

        self.dispute_counter = u256(int(self.dispute_counter) + 1)
        did = self.dispute_counter

        dispute = Dispute(
            id=did,
            battle_id=battle_id,
            raised_by=str(gl.message.sender_address),
            reason=reason,
            raised_at=self._now(),
            status="open",
            prior_winner=battle.verdict.winner,
            resolved_at=u256(0),
        )
        self.disputes[did] = dispute

        battle.state = "disputed"
        self.battles[battle_id] = battle
        return did

    @gl.public.write
    def resolve_dispute(self, dispute_id: u256) -> None:
        """Resolve an open dispute by re-running consensus."""
        dispute = self.disputes.get(dispute_id)
        if dispute is None:
            raise Exception("dispute not found")
        if dispute.status != "open":
            raise Exception("dispute is not open")

        battle = self.battles.get(dispute.battle_id)
        if battle is None:
            raise Exception("battle not found")

        # Re-run consensus on the original burns. New verdict supersedes old.
        for slot in (0, 1):
            b = self.burns.get(self._burn_key(battle.id, u256(slot)))
            if b is None:
                continue
            scorecard = self._score_burn(battle, b)
            new_burn = self._apply_scorecard(b, scorecard)
            self.burns[self._burn_key(battle.id, u256(slot))] = new_burn
        b0 = self.burns.get(self._burn_key(battle.id, u256(0)))
        b1 = self.burns.get(self._burn_key(battle.id, u256(1)))
        s0 = int(b0.total) if b0 else 0
        s1 = int(b1.total) if b1 else 0

        if s0 == s1:
            winner, loser = "0xDRAW", "0xDRAW"
            margin = 0
        elif s0 > s1:
            winner, loser = b0.combatant, b1.combatant
            margin = s0 - s1
        else:
            winner, loser = b1.combatant, b0.combatant
            margin = s1 - s0

        battle.verdict = Verdict(
            battle_id=battle.id,
            winner=winner,
            loser=loser,
            margin=u256(margin),
            reasoning=self._compose_reasoning(b0, b1, winner)[:800],
            judged_at=self._now(),
            judge_count=u256(3),
        )
        battle.state = "resolved"
        self.battles[battle.id] = battle

        # If the new verdict differs from the prior winner, the dispute
        # succeeded (overturned). Otherwise it was rejected (upheld).
        dispute.status = "overturned" if winner != dispute.prior_winner else "upheld"
        dispute.resolved_at = self._now()
        self.disputes[dispute_id] = dispute

    # -----------------------------------------------------------------------
    # View methods — return JSON-encoded strings because calldata encoder
    # does not support dicts or nested objects.
    # -----------------------------------------------------------------------

    @gl.public.view
    def get_battle(self, battle_id: u256) -> str:
        b = self.battles.get(battle_id)
        if b is None:
            return json.dumps({"error": "battle not found"})
        return json.dumps(self._battle_to_dict(b), default=str)

    @gl.public.view
    def get_recent_battles(self, limit: u256, offset: u256) -> str:
        lim = min(int(limit), 50)
        off = int(offset)
        ids = sorted(self.battles.keys(), reverse=True)
        sliced = ids[off : off + lim]
        out = [self._battle_to_dict(self.battles[i]) for i in sliced]
        return json.dumps({"battles": out, "total": len(ids)}, default=str)

    @gl.public.view
    def get_combatant(self, addr: str) -> str:
        c = self.combatants.get(addr)
        if c is None:
            return json.dumps({"error": "combatant not found"})
        return json.dumps(self._combatant_to_dict(c), default=str)

    @gl.public.view
    def get_dispute(self, dispute_id: u256) -> str:
        d = self.disputes.get(dispute_id)
        if d is None:
            return json.dumps({"error": "dispute not found"})
        return json.dumps(self._dispute_to_dict(d), default=str)

    @gl.public.view
    def get_stats(self) -> str:
        total = int(self.battle_counter)
        resolved = 0
        disputed = 0
        for bid in self.battles.keys():
            state = self.battles[bid].state
            if state == "resolved":
                resolved += 1
            elif state == "disputed":
                disputed += 1
        total_combatants = len(self.combatants)
        return json.dumps({
            "total_battles": total,
            "resolved_battles": resolved,
            "disputed_battles": disputed,
            "open_battles": total - resolved - disputed,
            "total_combatants": total_combatants,
            "total_disputes": int(self.dispute_counter),
        })

    # -----------------------------------------------------------------------
    # Serialization helpers (private)
    # -----------------------------------------------------------------------

    def _battle_to_dict(self, b: Battle) -> dict:
        return {
            "id": int(b.id),
            "topic": b.topic,
            "creator": b.creator,
            "opponent": b.opponent,
            "state": b.state,
            "stake": int(b.stake),
            "created_at": int(b.created_at),
            "burns": [self._burn_to_dict(x) for x in self._get_burns(b.id)],
            "verdict": self._verdict_to_dict(b.verdict),
        }

    def _burn_to_dict(self, b: Burn) -> dict:
        return {
            "combatant": b.combatant,
            "text": b.text,
            "context_url": b.context_url,
            "scores": {
                "wit": int(b.wit),
                "originality": int(b.originality),
                "burn": int(b.burn),
                "rhyme": int(b.rhyme),
                "topicality": int(b.topicality),
                "total": int(b.total),
            },
            "submitted_at": int(b.submitted_at),
        }

    def _verdict_to_dict(self, v: Verdict) -> dict:
        return {
            "battle_id": int(v.battle_id),
            "winner": v.winner,
            "loser": v.loser,
            "margin": int(v.margin),
            "reasoning": v.reasoning,
            "judged_at": int(v.judged_at),
            "judge_count": int(v.judge_count),
        }

    def _combatant_to_dict(self, c: Combatant) -> dict:
        return {
            "addr": c.addr,
            "wins": int(c.wins),
            "losses": int(c.losses),
            "draws": int(c.draws),
            "reputation": int(c.reputation),
            "total_burns": int(c.total_burns),
            "best_score": int(c.best_score),
            "best_score_battle": int(c.best_score_battle),
        }

    def _dispute_to_dict(self, d: Dispute) -> dict:
        return {
            "id": int(d.id),
            "battle_id": int(d.battle_id),
            "raised_by": d.raised_by,
            "reason": d.reason,
            "raised_at": int(d.raised_at),
            "status": d.status,
            "prior_winner": d.prior_winner,
            "resolved_at": int(d.resolved_at),
        }