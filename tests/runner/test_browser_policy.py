"""Tests for the runner browser URL policy."""

from __future__ import annotations

from collections.abc import Iterable

import pytest

from omnigent.runner.browser_policy import BrowserUrlPolicy


def _resolver(records: dict[str, list[str]]):
    def resolve(host: str, port: int | None) -> Iterable[str]:
        del port
        return records.get(host, [])

    return resolve


def test_browser_url_policy_allows_loopback_when_enabled() -> None:
    policy = BrowserUrlPolicy(resolver=_resolver({}))

    decision = policy.check_url(
        "HTTP://LOCALHOST:8080/path#ignored",
        allow_localhost=True,
        approved_external_hosts=set(),
    )

    assert decision.allowed is True
    assert decision.normalized_url == "http://localhost:8080/path"
    assert decision.origin == "http://localhost:8080"


def test_browser_url_policy_requires_public_origin_approval() -> None:
    policy = BrowserUrlPolicy(resolver=_resolver({"example.com": ["93.184.216.34"]}))

    denied = policy.check_url(
        "https://example.com/",
        allow_localhost=True,
        approved_external_hosts=set(),
    )
    allowed = policy.check_url(
        "https://example.com:443/",
        allow_localhost=True,
        approved_external_hosts={"https://example.com"},
    )

    assert denied.allowed is False
    assert denied.origin == "https://example.com"
    assert denied.reason == "external origin requires approval"
    assert allowed.allowed is True
    assert allowed.normalized_url == "https://example.com/"
    assert allowed.origin == "https://example.com"


@pytest.mark.parametrize(
    "url",
    [
        "file:///tmp/x",
        "data:text/html,hi",
        "javascript:alert(1)",
        "about:blank",
        "blob:https://example.com/id",
        "ws://example.com/socket",
    ],
)
def test_browser_url_policy_blocks_unsupported_schemes(url: str) -> None:
    policy = BrowserUrlPolicy(resolver=_resolver({}))

    decision = policy.check_url(
        url,
        allow_localhost=True,
        approved_external_hosts=set(),
    )

    assert decision.allowed is False
    assert "scheme" in (decision.reason or "") or "host" in (decision.reason or "")


@pytest.mark.parametrize(
    "url,records",
    [
        ("https://user:pass@example.com/", {"example.com": ["93.184.216.34"]}),
        ("https://example.test/", {"example.test": ["10.0.0.1"]}),
        ("https://example.test/", {"example.test": ["169.254.169.254"]}),
        ("https://metadata.google.internal/", {"metadata.google.internal": ["8.8.8.8"]}),
        ("https://[::ffff:10.0.0.1]/", {}),
    ],
)
def test_browser_url_policy_blocks_private_and_metadata_targets(
    url: str,
    records: dict[str, list[str]],
) -> None:
    policy = BrowserUrlPolicy(resolver=_resolver(records))

    decision = policy.check_url(
        url,
        allow_localhost=True,
        approved_external_hosts={"https://example.test", "https://example.com"},
    )

    assert decision.allowed is False


def test_browser_url_policy_reresolves_each_decision_for_rebinding_defense() -> None:
    calls = 0

    def resolve(host: str, port: int | None) -> Iterable[str]:
        nonlocal calls
        del host, port
        calls += 1
        if calls == 1:
            return ["93.184.216.34"]
        return ["10.0.0.1"]

    policy = BrowserUrlPolicy(resolver=resolve)

    first = policy.check_url(
        "https://example.com/",
        allow_localhost=True,
        approved_external_hosts={"https://example.com"},
    )
    second = policy.check_url(
        "https://example.com/",
        allow_localhost=True,
        approved_external_hosts={"https://example.com"},
    )

    assert first.allowed is True
    assert second.allowed is False
    assert calls == 2
