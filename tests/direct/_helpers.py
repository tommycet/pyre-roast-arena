"""Helper for loading the Pyre contract in unit tests."""
from __future__ import annotations

import importlib
import os
import sys
from typing import Any

# Ensure contracts/ is on sys.path so `import pyre` resolves.
_CONTRACTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "contracts"))
if _CONTRACTS_DIR not in sys.path:
    sys.path.insert(0, _CONTRACTS_DIR)

# Ensure conftest.py mock is installed before pyre imports genlayer.
import conftest  # noqa: F401

import pyre  # type: ignore  # noqa: E402

# Re-export common types so tests can write `pyre.u256(...)` cleanly.
u256 = pyre.u256
Address = pyre.Address


def fresh_pyre() -> Any:
    """Return a fresh Pyre contract instance with mock storage initialized.

    The mock-genlayer pattern does NOT auto-create TreeMap/DynArray fields, so
    we have to do it manually. This helper centralizes that boilerplate.
    """
    # Reload the contract module to reset class-level constants if any were
    # patched in tests. (Currently none are, but this keeps the door open.)
    if "pyre" in sys.modules:
        importlib.reload(sys.modules["pyre"])
    instance = sys.modules["pyre"].Pyre()
    instance.battles = {}
    instance.burns = {}              # flat burn storage (keyed by battle_id*2+slot)
    instance.combatants = {}
    instance.disputes = {}
    # Attach to the mock-gl module so test helpers can reach it without
    # threading the instance through every assertion.
    sys.modules["genlayer.gl"]._pyre_instance_for_test = instance
    return instance


def as_sender(pyre_instance: Any, addr: str) -> None:
    """Set the mock `gl.message.sender_address` for the next transaction."""
    gl = sys.modules["genlayer.gl"]
    gl.message.sender_address = addr


def as_value(pyre_instance: Any, value: int) -> None:
    """Set the mock `gl.message.value` for the next payable transaction."""
    gl = sys.modules["genlayer.gl"]
    gl.message.value = value


def get_burns_for(battle):
    """Return the burns attached to a battle in submission order.

    Reads directly from the mock's flat `pyre.burns` TreeMap using the battle id
    + the canonical slot key. In live mode, the contract's _get_burns() helper
    does the same via the real TreeMap.
    """
    import sys
    # Walk up to the Pyre instance via the module-level reference held by the
    # conftest mock. The mock-genlayer pattern makes this a simple dict lookup.
    gl = sys.modules.get("genlayer.gl")
    # No clean way to reach the instance from a Battle dataclass in the mock,
    # so use the dataclass field that records the count, plus a side-channel
    # lookup against the conftest-attached instance if present.
    pyre_instance = getattr(gl, "_pyre_instance_for_test", None)
    if pyre_instance is not None and hasattr(pyre_instance, "burns"):
        out = []
        for slot in (0, 1):
            b = pyre_instance.burns.get(int(battle.id) * 2 + slot)
            if b is not None:
                out.append(b)
        return out
    # Last-resort fallback: if battle exposes .burns directly, use it.
    return list(getattr(battle, "burns", []))
