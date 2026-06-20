"""conftest.py — pytest fixtures + genlayer mock installer.

GenLayer's `genlayer` package is only available inside GenVM. For local unit
tests we install a fully-mocked `genlayer` module before the contract imports.
The mock is a faithful approximation that lets us exercise the contract logic
in-process without a running validator.

Critical mocks (per genlayer-dapp-development skill pitfall list):
  - `allow_storage`, `u256`, `TreeMap`, `Address`, `DynArray` must be on the
    TOP-LEVEL `genlayer` module (not `genlayer.gl.*`) because contracts use
    `from genlayer import *`.
  - `mock_module.gl = mock_gl` so `gl.Contract` resolves.
  - `mock_gl.Contract` set so `class Foo(gl.Contract)` works.
  - `mock_gl.public` mocked with `.write`, `.view`, `.write.payable` noop
    decorators (otherwise AttributeError on `@gl.public.write`).
  - `_Uint(int)` so `gl.message.value < self.ENTRY_FEE` comparisons work.
  - `eq_principle.prompt_non_comparative.side_effect = lambda fn, **kw: fn()`
    so the LLM code actually runs and we can assert on its output.
  - TreeMap/DynArray fields are NOT auto-created by the mock. Tests must do
    `instance.battles = {}` etc. in setup.
"""
from __future__ import annotations

import json
import sys
import types
from dataclasses import dataclass, field
from typing import Any, Dict, List
from unittest.mock import MagicMock

import pytest


def _install_genlayer_mock() -> None:
    """Install a fake `genlayer` module so contracts can import cleanly."""
    if "genlayer" in sys.modules and getattr(
        sys.modules["genlayer"], "_is_pyre_mock", False
    ):
        return

    mock_module = types.ModuleType("genlayer")
    mock_gl = types.ModuleType("genlayer.gl")

    # Type aliases
    class _Uint(int):
        """Sized unsigned int — int subclass so comparisons work without casts."""

        def __new__(cls, v: Any = 0) -> "_Uint":
            return super().__new__(cls, int(v))

    for name in ("u256", "u64", "u32", "bigint", "i256", "u8", "u16"):
        setattr(mock_module, name, _Uint)
    mock_module.Address = str
    mock_module.TreeMap = lambda *args, **kwargs: {}
    mock_module.DynArray = list

    class _Contract:
        pass

    mock_module.Contract = _Contract
    mock_module.allow_storage = lambda cls: cls
    mock_module.gl = mock_gl
    mock_module._is_pyre_mock = True

    # gl.Contract must be set on mock_gl too, since contracts reference
    # `gl.Contract` via class declaration.
    mock_gl.Contract = _Contract

    # Public decorators — noop that returns the function.
    def _noop(fn):
        return fn

    mock_public = MagicMock()
    mock_public.write = _noop
    mock_public.write.payable = _noop
    mock_public.view = _noop
    mock_gl.public = mock_public

    # Message context — settable per test
    mock_message = MagicMock()
    mock_message.value = 0
    mock_message.sender_address = "0xTEST_SENDER"
    mock_message_raw = {"datetime": "2026-06-19T00:00:00Z"}
    mock_gl.message = mock_message
    mock_gl.message_raw = mock_message_raw

    # Nondet (LLM + web)
    mock_nondet = MagicMock()
    mock_nondet.web.render.return_value = "page text"
    mock_nondet.web.get.return_value = MagicMock(body=b"text")
    mock_nondet.exec_prompt.return_value = json.dumps({})
    mock_gl.nondet = mock_nondet

    # Equivalence principles — pass through to the wrapped fn so we can
    # observe side effects and assert on outputs.
    mock_eq = MagicMock()
    mock_eq.prompt_non_comparative.side_effect = lambda fn, **kw: fn()
    mock_eq.prompt_comparative.side_effect = lambda fn, **kw: fn()
    mock_eq.strict_eq.side_effect = lambda fn, **kw: fn()
    mock_gl.eq_principle = mock_eq

    # UserError passthrough
    class UserError(Exception):
        pass

    mock_gl.UserError = UserError

    sys.modules["genlayer"] = mock_module
    sys.modules["genlayer.gl"] = mock_gl


# Install mock at module import — before any contract code is imported.
_install_genlayer_mock()


@dataclass
class MockWebRender:
    """Per-test controllable web render responses.

    Usage:
        mock_web.set("https://x.com/a", "Hello world")
        mock_web.set("https://x.com/b", "Another text")
        mock_web.fail("https://x.com/c", RuntimeError("timeout"))
    """

    responses: Dict[str, Any] = field(default_factory=dict)
    failures: Dict[str, Exception] = field(default_factory=dict)

    def set(self, url: str, body: str) -> None:
        self.responses[url] = body

    def fail(self, url: str, exc: Exception) -> None:
        self.failures[url] = exc

    def install(self) -> None:
        mock_gl = sys.modules["genlayer.gl"]
        mock_gl.nondet.web.render.side_effect = self._side_effect
        mock_gl.nondet.web.get.side_effect = self._side_effect

    def _side_effect(self, url: str, *args, **kwargs):
        if url in self.failures:
            raise self.failures[url]
        if url in self.responses:
            return self.responses[url]
        return f"mock content for {url}"


@dataclass
class MockLLM:
    """Per-test controllable LLM responses.

    Usage:
        mock_llm.queue([json.dumps({"x": 1}), json.dumps({"x": 2})])
        mock_llm.set_default(json.dumps({"x": 0}))
    """

    queue_list: List[str] = field(default_factory=list)
    default: str = "{}"

    def queue(self, responses: List[str]) -> None:
        self.queue_list = list(responses)

    def set_default(self, response: str) -> None:
        self.default = response

    def install(self) -> None:
        mock_gl = sys.modules["genlayer.gl"]
        mock_gl.nondet.exec_prompt.side_effect = self._side_effect
        mock_gl.nondet.exec_prompt.return_value = self.default

    def _side_effect(self, *args, **kwargs):
        if self.queue_list:
            return self.queue_list.pop(0)
        return self.default


@pytest.fixture
def mock_web() -> MockWebRender:
    mw = MockWebRender()
    mw.install()
    return mw


@pytest.fixture
def mock_llm() -> MockLLM:
    ml = MockLLM()
    ml.install()
    return ml


@pytest.fixture(autouse=True)
def reset_mock_state(request):
    """Reset mock state between tests so side_effects don't leak.

    Runs BEFORE per-test fixtures (mock_llm, mock_web) install their side_effects
    thanks to the `_reset_first` ordering trick. After-yield cleanup is a no-op
    since the next test's setup re-runs reset_mock_state first.
    """
    mock_gl = sys.modules["genlayer.gl"]
    mock_gl.nondet.exec_prompt.side_effect = None
    mock_gl.nondet.exec_prompt.return_value = json.dumps({})
    mock_gl.nondet.web.render.side_effect = None
    mock_gl.nondet.web.render.return_value = "page text"
    mock_gl.nondet.web.get.side_effect = None
    mock_gl.nondet.web.get.return_value = MagicMock(body=b"text")
    mock_gl.message.value = 0
    mock_gl.message.sender_address = "0xTEST_SENDER"
    yield
    # No teardown needed — next test's reset_mock_state will clear again.