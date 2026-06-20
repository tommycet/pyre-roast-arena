"""Tests for view methods — get_battle, get_recent_battles, get_combatant, get_stats."""
from __future__ import annotations

import json

from _helpers import as_sender, fresh_pyre, get_burns_for, u256


def test_get_battle_returns_full_battle_json():
    pyre = fresh_pyre()
    as_sender(pyre, "0xA")
    bid = pyre.create_battle("topic", u256(10**16))

    out = json.loads(pyre.get_battle(u256(bid)))
    assert out["topic"] == "topic"
    assert out["creator"] == "0xA"
    assert out["state"] == "open"
    assert "burns" in out
    assert "verdict" in out


def test_get_battle_returns_error_for_unknown_id():
    pyre = fresh_pyre()
    out = json.loads(pyre.get_battle(u256(9999)))
    assert "error" in out


def test_get_recent_battles_returns_paginated_list():
    pyre = fresh_pyre()
    for i in range(5):
        as_sender(pyre, f"0x{i}")
        pyre.create_battle(f"topic {i}", u256(10**16))

    out = json.loads(pyre.get_recent_battles(u256(3), u256(0)))
    assert len(out["battles"]) == 3
    assert out["total"] == 5
    # Newest first
    assert out["battles"][0]["id"] == 5
    assert out["battles"][2]["id"] == 3


def test_get_combatant_returns_profile():
    pyre = fresh_pyre()
    as_sender(pyre, "0xALICE")
    pyre.create_battle("topic", u256(10**16))

    out = json.loads(pyre.get_combatant("0xALICE"))
    assert out["addr"] == "0xALICE"
    assert out["wins"] == 0
    assert out["reputation"] == 50


def test_get_combatant_returns_error_for_unknown_address():
    pyre = fresh_pyre()
    out = json.loads(pyre.get_combatant("0xNOBODY"))
    assert "error" in out


def test_get_stats_reflects_state():
    pyre = fresh_pyre()
    as_sender(pyre, "0xA")
    pyre.create_battle("topic", u256(10**16))

    out = json.loads(pyre.get_stats())
    assert out["total_battles"] == 1
    assert out["open_battles"] == 1
    assert out["resolved_battles"] == 0
    assert out["total_combatants"] == 1
    assert out["total_disputes"] == 0