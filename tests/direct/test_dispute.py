"""Tests for raise_dispute + resolve_dispute."""
from __future__ import annotations

import json

import pytest

from _helpers import as_sender, fresh_pyre, get_burns_for, u256


def _resolved_battle(pyre):
    """Create + judge a battle. Returns bid.

    NOTE: caller must set up the LLM mock queue with at least 2 responses
    (one per burn) via `gl.nondet.exec_prompt.side_effect = [list]`.
    """
    as_sender(pyre, "0xA")
    bid = pyre.create_battle("topic", u256(10**16))
    as_sender(pyre, "0xB")
    pyre.join_battle(u256(bid))
    as_sender(pyre, "0xA")
    pyre.submit_burn(u256(bid), "burn one", "")
    as_sender(pyre, "0xB")
    pyre.submit_burn(u256(bid), "burn two", "")
    pyre.judge_battle(u256(bid))
    return bid


def test_raise_dispute_creates_open_dispute():
    import sys
    gl = sys.modules["genlayer.gl"]
    gl.nondet.exec_prompt.side_effect = [
        json.dumps({"wit": 18, "originality": 15, "burn": 19, "rhyme": 12, "topicality": 17, "total": 81, "reasoning": "Sharp."}),
        json.dumps({"wit": 12, "originality": 10, "burn": 14, "rhyme": 13, "topicality": 11, "total": 60, "reasoning": "Stock."}),
    ]
    pyre = fresh_pyre()
    bid = _resolved_battle(pyre)

    as_sender(pyre, "0xSPECTATOR")
    did = pyre.raise_dispute(u256(bid), "judges were clearly biased")

    d = pyre.disputes[did]
    assert d.battle_id == bid
    assert d.raised_by == "0xSPECTATOR"
    assert d.status == "open"
    assert pyre.battles[bid].state == "disputed"


def test_raise_dispute_rejects_unresolved_battle():
    pyre = fresh_pyre()
    as_sender(pyre, "0xA")
    bid = pyre.create_battle("topic", u256(10**16))

    as_sender(pyre, "0xSPECTATOR")
    with pytest.raises(Exception, match="resolved"):
        pyre.raise_dispute(u256(bid), "no verdict yet")


def test_raise_dispute_rejects_empty_reason():
    import sys
    gl = sys.modules["genlayer.gl"]
    gl.nondet.exec_prompt.side_effect = [
        json.dumps({"wit": 18, "originality": 15, "burn": 19, "rhyme": 12, "topicality": 17, "total": 81, "reasoning": "Sharp."}),
        json.dumps({"wit": 12, "originality": 10, "burn": 14, "rhyme": 13, "topicality": 11, "total": 60, "reasoning": "Stock."}),
    ]
    pyre = fresh_pyre()
    bid = _resolved_battle(pyre)

    as_sender(pyre, "0xSPECTATOR")
    with pytest.raises(Exception, match="reason required"):
        pyre.raise_dispute(u256(bid), "")


def test_raise_dispute_rejects_overlong_reason():
    import sys
    gl = sys.modules["genlayer.gl"]
    gl.nondet.exec_prompt.side_effect = [
        json.dumps({"wit": 18, "originality": 15, "burn": 19, "rhyme": 12, "topicality": 17, "total": 81, "reasoning": "Sharp."}),
        json.dumps({"wit": 12, "originality": 10, "burn": 14, "rhyme": 13, "topicality": 11, "total": 60, "reasoning": "Stock."}),
    ]
    pyre = fresh_pyre()
    bid = _resolved_battle(pyre)

    as_sender(pyre, "0xSPECTATOR")
    with pytest.raises(Exception, match="reason must be"):
        pyre.raise_dispute(u256(bid), "x" * 281)


def test_resolve_dispute_re_runs_consensus_and_marks_status():
    import sys
    gl = sys.modules["genlayer.gl"]
    # Queue 4 responses: 2 for original judge + 2 for re-judge.
    gl.nondet.exec_prompt.side_effect = [
        json.dumps({"wit": 18, "originality": 15, "burn": 19, "rhyme": 12, "topicality": 17, "total": 81, "reasoning": "Sharp."}),
        json.dumps({"wit": 12, "originality": 10, "burn": 14, "rhyme": 13, "topicality": 11, "total": 60, "reasoning": "Stock."}),
        json.dumps({"wit": 5, "originality": 5, "burn": 5, "rhyme": 5, "topicality": 5, "total": 25, "reasoning": "Lesser on reread."}),
        json.dumps({"wit": 18, "originality": 17, "burn": 19, "rhyme": 16, "topicality": 18, "total": 88, "reasoning": "Grew on reread."}),
    ]
    pyre = fresh_pyre()
    bid = _resolved_battle(pyre)

    as_sender(pyre, "0xSPECTATOR")
    did = pyre.raise_dispute(u256(bid), "let me see it again")

    pyre.resolve_dispute(u256(did))

    d = pyre.disputes[did]
    assert d.status in ("upheld", "overturned")
    assert int(d.resolved_at) > 0
    assert pyre.battles[bid].state == "resolved"
    assert pyre.battles[bid].verdict.winner == "0xB"  # B now wins