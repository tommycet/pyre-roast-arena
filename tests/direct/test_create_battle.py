"""Tests for create_battle / join_battle."""
from __future__ import annotations

import pytest

from _helpers import as_sender, fresh_pyre, get_burns_for, u256


def test_create_battle_increments_counter_and_stores_topic():
    pyre = fresh_pyre()
    as_sender(pyre, "0xALICE")

    bid = pyre.create_battle("your stack is held together with prayer", u256(10**16))

    assert int(bid) == 1
    assert int(pyre.battle_counter) == 1
    battle = pyre.battles[bid]
    assert battle.topic == "your stack is held together with prayer"
    assert battle.creator == "0xALICE"
    assert battle.state == "open"
    assert battle.opponent == ""
    assert len(get_burns_for(battle)) == 0


def test_create_battle_rejects_empty_topic():
    pyre = fresh_pyre()
    as_sender(pyre, "0xALICE")

    with pytest.raises(Exception, match="topic required"):
        pyre.create_battle("", u256(10**16))

    with pytest.raises(Exception, match="topic required"):
        pyre.create_battle("   ", u256(10**16))


def test_create_battle_rejects_overlong_topic():
    pyre = fresh_pyre()
    as_sender(pyre, "0xALICE")

    with pytest.raises(Exception, match="topic must be"):
        pyre.create_battle("a" * 121, u256(10**16))


def test_create_battle_creates_combatant_profile():
    pyre = fresh_pyre()
    as_sender(pyre, "0xNEWC")

    pyre.create_battle("hello world", u256(10**16))

    c = pyre.combatants["0xNEWC"]
    assert c.reputation == 50
    assert c.wins == 0


def test_join_battle_transitions_state():
    pyre = fresh_pyre()
    as_sender(pyre, "0xA")
    bid = pyre.create_battle("topic", u256(10**16))

    as_sender(pyre, "0xB")
    pyre.join_battle(u256(bid))

    battle = pyre.battles[bid]
    assert battle.opponent == "0xB"
    assert battle.state == "both_joined"


def test_join_battle_rejects_double_join():
    pyre = fresh_pyre()
    as_sender(pyre, "0xA")
    bid = pyre.create_battle("topic", u256(10**16))
    as_sender(pyre, "0xB")
    pyre.join_battle(u256(bid))

    as_sender(pyre, "0xC")
    with pytest.raises(Exception, match="not open"):
        pyre.join_battle(u256(bid))


def test_join_battle_rejects_self_join():
    pyre = fresh_pyre()
    as_sender(pyre, "0xA")
    bid = pyre.create_battle("topic", u256(10**16))

    as_sender(pyre, "0xA")
    with pytest.raises(Exception, match="cannot join your own"):
        pyre.join_battle(u256(bid))


def test_join_battle_rejects_unknown_battle():
    pyre = fresh_pyre()
    as_sender(pyre, "0xB")
    with pytest.raises(Exception, match="battle not found"):
        pyre.join_battle(u256(999))