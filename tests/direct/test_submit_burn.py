"""Tests for submit_burn."""
from __future__ import annotations

import pytest

from _helpers import as_sender, fresh_pyre, get_burns_for, u256


def _setup_two_combatants(pyre, topic="test topic"):
    as_sender(pyre, "0xA")
    bid = pyre.create_battle(topic, u256(10**16))
    as_sender(pyre, "0xB")
    pyre.join_battle(u256(bid))
    return bid


def test_submit_burn_appends_and_stays_in_both_joined():
    pyre = fresh_pyre()
    bid = _setup_two_combatants(pyre)

    as_sender(pyre, "0xA")
    pyre.submit_burn(u256(bid), "first burn", "")

    battle = pyre.battles[bid]
    assert len(get_burns_for(battle)) == 1
    assert battle.state == "both_joined"  # not yet both_burned
    assert get_burns_for(battle)[0].combatant == "0xA"
    assert get_burns_for(battle)[0].text == "first burn"


def test_submit_burn_marks_both_burned_when_two_submitted():
    pyre = fresh_pyre()
    bid = _setup_two_combatants(pyre)

    as_sender(pyre, "0xA")
    pyre.submit_burn(u256(bid), "burn one", "")
    as_sender(pyre, "0xB")
    pyre.submit_burn(u256(bid), "burn two", "")

    assert pyre.battles[bid].state == "both_burned"
    assert len(get_burns_for(pyre.battles[bid])) == 2


def test_submit_burn_rejects_non_combatant():
    pyre = fresh_pyre()
    bid = _setup_two_combatants(pyre)

    as_sender(pyre, "0xRANDO")
    with pytest.raises(Exception, match="only combatants"):
        pyre.submit_burn(u256(bid), "impostor", "")


def test_submit_burn_rejects_double_submit():
    pyre = fresh_pyre()
    bid = _setup_two_combatants(pyre)

    as_sender(pyre, "0xA")
    pyre.submit_burn(u256(bid), "first", "")
    as_sender(pyre, "0xA")
    with pytest.raises(Exception, match="already submitted"):
        pyre.submit_burn(u256(bid), "second", "")


def test_submit_burn_rejects_empty_text():
    pyre = fresh_pyre()
    bid = _setup_two_combatants(pyre)

    as_sender(pyre, "0xA")
    with pytest.raises(Exception, match="burn text required"):
        pyre.submit_burn(u256(bid), "", "")


def test_submit_burn_rejects_overlong_text():
    pyre = fresh_pyre()
    bid = _setup_two_combatants(pyre)

    as_sender(pyre, "0xA")
    with pytest.raises(Exception, match="burn must be"):
        pyre.submit_burn(u256(bid), "a" * 501, "")


def test_submit_burn_increments_combatant_total_burns():
    pyre = fresh_pyre()
    bid = _setup_two_combatants(pyre)

    as_sender(pyre, "0xA")
    pyre.submit_burn(u256(bid), "first", "")

    assert int(pyre.combatants["0xA"].total_burns) == 1


def test_submit_burn_rejects_outside_submission_phase():
    pyre = fresh_pyre()
    bid = _setup_two_combatants(pyre)
    as_sender(pyre, "0xA")
    pyre.submit_burn(u256(bid), "first", "")
    as_sender(pyre, "0xB")
    pyre.submit_burn(u256(bid), "second", "")

    # Now state is both_burned — submit_burn should reject.
    as_sender(pyre, "0xA")
    with pytest.raises(Exception, match="submission phase"):
        pyre.submit_burn(u256(bid), "late", "")