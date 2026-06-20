"""Tests for judge_battle + AI consensus + reputation effects."""
from __future__ import annotations

import json

import pytest

from _helpers import as_sender, fresh_pyre, get_burns_for, u256


def _setup_two_burns(pyre):
    """Helper: create a battle, both join, both submit."""
    as_sender(pyre, "0xA")
    bid = pyre.create_battle("test topic", u256(10**16))
    as_sender(pyre, "0xB")
    pyre.join_battle(u256(bid))
    as_sender(pyre, "0xA")
    pyre.submit_burn(u256(bid), "burn one", "")
    as_sender(pyre, "0xB")
    pyre.submit_burn(u256(bid), "burn two", "")
    return bid


def test_judge_battle_writes_verdict_and_updates_state(mock_llm):
    pyre = fresh_pyre()
    bid = _setup_two_burns(pyre)

    mock_llm.queue([
        json.dumps({"wit": 18, "originality": 15, "burn": 19, "rhyme": 12, "topicality": 17, "total": 81, "reasoning": "Sharp."}),
        json.dumps({"wit": 12, "originality": 10, "burn": 14, "rhyme": 13, "topicality": 11, "total": 60, "reasoning": "Stock."}),
    ])

    pyre.judge_battle(u256(bid))

    battle = pyre.battles[bid]
    assert battle.state == "resolved"
    assert battle.verdict.winner == "0xA"
    assert battle.verdict.loser == "0xB"
    assert int(battle.verdict.margin) == 21


def test_judge_battle_records_burn_scores(mock_llm):
    pyre = fresh_pyre()
    bid = _setup_two_burns(pyre)

    mock_llm.queue([
        json.dumps({"wit": 18, "originality": 15, "burn": 19, "rhyme": 12, "topicality": 17, "total": 81, "reasoning": "Sharp."}),
        json.dumps({"wit": 12, "originality": 10, "burn": 14, "rhyme": 13, "topicality": 11, "total": 60, "reasoning": "Stock."}),
    ])

    pyre.judge_battle(u256(bid))

    burn_a = get_burns_for(pyre.battles[bid])[0]
    burn_b = get_burns_for(pyre.battles[bid])[1]
    assert int(burn_a.total) == 81
    assert int(burn_a.wit) == 18
    assert int(burn_a.burn) == 19
    assert int(burn_b.total) == 60


def test_judge_battle_handles_draw(mock_llm):
    pyre = fresh_pyre()
    bid = _setup_two_burns(pyre)

    mock_llm.queue([
        json.dumps({"wit": 10, "originality": 10, "burn": 10, "rhyme": 10, "topicality": 10, "total": 50, "reasoning": "Even."}),
        json.dumps({"wit": 10, "originality": 10, "burn": 10, "rhyme": 10, "topicality": 10, "total": 50, "reasoning": "Even."}),
    ])

    pyre.judge_battle(u256(bid))

    v = pyre.battles[bid].verdict
    assert v.winner == "0xDRAW"
    assert v.loser == "0xDRAW"
    assert int(v.margin) == 0


def test_judge_battle_updates_reputation_winner(mock_llm):
    pyre = fresh_pyre()
    bid = _setup_two_burns(pyre)

    mock_llm.queue([
        json.dumps({"wit": 18, "originality": 15, "burn": 19, "rhyme": 12, "topicality": 17, "total": 81, "reasoning": "Sharp."}),
        json.dumps({"wit": 12, "originality": 10, "burn": 14, "rhyme": 13, "topicality": 11, "total": 60, "reasoning": "Stock."}),
    ])

    pyre.judge_battle(u256(bid))

    a = pyre.combatants["0xA"]
    b = pyre.combatants["0xB"]
    # 0xA wins: reputation +5 (50->55), wins=1, losses=0
    # 0xB loses: reputation -2 (50->48), wins=0, losses=1
    assert int(a.wins) == 1
    assert int(a.losses) == 0
    assert int(a.reputation) == 55
    assert int(b.wins) == 0
    assert int(b.losses) == 1
    assert int(b.reputation) == 48


def test_judge_battle_updates_reputation_draw(mock_llm):
    pyre = fresh_pyre()
    bid = _setup_two_burns(pyre)

    mock_llm.queue([
        json.dumps({"wit": 10, "originality": 10, "burn": 10, "rhyme": 10, "topicality": 10, "total": 50, "reasoning": "Even."}),
        json.dumps({"wit": 10, "originality": 10, "burn": 10, "rhyme": 10, "topicality": 11, "total": 51, "reasoning": "Slight."}),
    ])

    pyre.judge_battle(u256(bid))

    # total 50 vs 51 → not a draw; let's use exact equal.
    # Re-run with exact tie.
    pyre = fresh_pyre()
    bid = _setup_two_burns(pyre)
    mock_llm.queue([
        json.dumps({"wit": 10, "originality": 10, "burn": 10, "rhyme": 10, "topicality": 10, "total": 50, "reasoning": "Even."}),
        json.dumps({"wit": 10, "originality": 10, "burn": 10, "rhyme": 10, "topicality": 10, "total": 50, "reasoning": "Even."}),
    ])
    pyre.judge_battle(u256(bid))
    a = pyre.combatants["0xA"]
    b = pyre.combatants["0xB"]
    assert int(a.draws) == 1
    assert int(b.draws) == 1
    # 50 + 1 = 51
    assert int(a.reputation) == 51
    assert int(b.reputation) == 51


def test_judge_battle_records_best_score(mock_llm):
    pyre = fresh_pyre()
    bid = _setup_two_burns(pyre)

    mock_llm.queue([
        json.dumps({"wit": 18, "originality": 15, "burn": 19, "rhyme": 12, "topicality": 17, "total": 81, "reasoning": "Sharp."}),
        json.dumps({"wit": 12, "originality": 10, "burn": 14, "rhyme": 13, "topicality": 11, "total": 60, "reasoning": "Stock."}),
    ])

    pyre.judge_battle(u256(bid))

    a = pyre.combatants["0xA"]
    b = pyre.combatants["0xB"]
    assert int(a.best_score) == 81
    assert int(a.best_score_battle) == int(bid)
    assert int(b.best_score) == 60


def test_judge_battle_clamps_out_of_range_dimensions(mock_llm):
    pyre = fresh_pyre()
    bid = _setup_two_burns(pyre)

    mock_llm.queue([
        json.dumps({"wit": 999, "originality": -5, "burn": 19, "rhyme": 12, "topicality": 17, "total": 999, "reasoning": "Sharp."}),
        json.dumps({"wit": 12, "originality": 10, "burn": 14, "rhyme": 13, "topicality": 11, "total": 60, "reasoning": "Stock."}),
    ])

    pyre.judge_battle(u256(bid))

    # Clamping keeps dims in [0,20] but total is taken from the LLM raw —
    # we clamp dimensions for storage but total reflects what the LLM said.
    # The key invariant: each dim is 0-20.
    a = get_burns_for(pyre.battles[bid])[0]
    assert 0 <= int(a.wit) <= 20
    assert 0 <= int(a.originality) <= 20
    assert 0 <= int(a.burn) <= 20
    assert 0 <= int(a.rhyme) <= 20
    assert 0 <= int(a.topicality) <= 20


def test_judge_battle_handles_malformed_llm_output(mock_llm):
    pyre = fresh_pyre()
    bid = _setup_two_burns(pyre)

    mock_llm.queue([
        "```json\n{\"wit\": 18, \"originality\": 15, \"burn\": 19, \"rhyme\": 12, \"topicality\": 17, \"total\": 81, \"reasoning\": \"Sharp.\"}\n```",
        "not even close to json",
    ])

    pyre.judge_battle(u256(bid))

    # Second burn should score zero across the board.
    b = get_burns_for(pyre.battles[bid])[1]
    assert int(b.total) == 0


def test_judge_battle_rejects_pre_both_burned(mock_llm):
    pyre = fresh_pyre()
    as_sender(pyre, "0xA")
    bid = pyre.create_battle("topic", u256(10**16))
    as_sender(pyre, "0xB")
    pyre.join_battle(u256(bid))
    # Only A has submitted.
    as_sender(pyre, "0xA")
    pyre.submit_burn(u256(bid), "first", "")

    with pytest.raises(Exception, match="not ready"):
        pyre.judge_battle(u256(bid))