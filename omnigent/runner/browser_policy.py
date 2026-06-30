"""URL policy helpers for runner-owned browser sessions."""

from __future__ import annotations

import ipaddress
import socket
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from urllib.parse import SplitResult, urlsplit, urlunsplit

Resolver = Callable[[str, int | None], Iterable[str]]

_ALLOWED_SCHEMES = {"http", "https"}
_BLOCKED_METADATA_HOSTS = {
    "metadata.google.internal",
    "169.254.169.254",
}
_DEFAULT_PORTS = {"http": 80, "https": 443}
_LOCALHOST_NAMES = {"localhost"}


@dataclass(frozen=True)
class BrowserUrlDecision:
    """Decision returned by :class:`BrowserUrlPolicy`."""

    allowed: bool
    normalized_url: str | None = None
    origin: str | None = None
    reason: str | None = None


class BrowserUrlPolicy:
    """Validate browser navigation and request targets before network use."""

    def __init__(
        self,
        *,
        resolver: Resolver | None = None,
        cache_ttl_seconds: float = 0.0,
    ) -> None:
        self._resolver = resolver or _resolve_host
        self._cache_ttl_seconds = cache_ttl_seconds
        self._cache: dict[tuple[str, int | None], tuple[float, tuple[str, ...]]] = {}

    def check_url(
        self,
        url: str,
        *,
        allow_localhost: bool,
        approved_external_hosts: set[str],
    ) -> BrowserUrlDecision:
        """Return whether *url* may be loaded by the agent browser."""
        try:
            parsed = urlsplit(url)
        except ValueError as exc:
            return _blocked(f"malformed URL: {exc}")

        normalized = _normalize_url(parsed)
        if isinstance(normalized, str):
            return _blocked(normalized)
        parsed = normalized

        scheme = parsed.scheme
        host = parsed.hostname
        port = parsed.port
        if host is None:
            return _blocked("URL must include a host")
        if parsed.username is not None or parsed.password is not None:
            return _blocked("URL credentials are not allowed")
        if scheme not in _ALLOWED_SCHEMES:
            return _blocked(f"scheme {scheme!r} is not allowed")

        normalized_host = _normalize_host(host)
        if normalized_host is None:
            return _blocked("host is malformed")
        if normalized_host in _BLOCKED_METADATA_HOSTS:
            return _blocked("cloud metadata hosts are not allowed")

        normalized_url = _url_with_host(parsed, normalized_host)
        origin = _origin_for(parsed, normalized_host)

        if _is_localhost_target(normalized_host):
            if not allow_localhost:
                return _blocked("localhost targets are not allowed")
            return BrowserUrlDecision(True, normalized_url=normalized_url, origin=origin)

        addresses = self._addresses_for(normalized_host, port)
        if not addresses:
            return _blocked("host did not resolve")
        for address in addresses:
            ip_decision = _public_ip_decision(address)
            if ip_decision is not None:
                return _blocked(ip_decision)

        if origin not in approved_external_hosts:
            return _blocked("external origin requires approval", normalized_url, origin)
        return BrowserUrlDecision(True, normalized_url=normalized_url, origin=origin)

    def _addresses_for(self, host: str, port: int | None) -> tuple[str, ...]:
        cache_key = (host, port)
        now = time.monotonic()
        cached = self._cache.get(cache_key)
        if cached is not None and cached[0] > now:
            return cached[1]
        addresses = tuple(self._resolver(host, port))
        if self._cache_ttl_seconds > 0:
            self._cache[cache_key] = (now + self._cache_ttl_seconds, addresses)
        return addresses


def _resolve_host(host: str, port: int | None) -> tuple[str, ...]:
    infos = socket.getaddrinfo(host, port or 0, type=socket.SOCK_STREAM)
    return tuple({info[4][0] for info in infos})


def _normalize_url(parsed: SplitResult) -> SplitResult | str:
    scheme = parsed.scheme.lower()
    if not scheme:
        return "URL must include a scheme"
    if parsed.fragment:
        parsed = parsed._replace(fragment="")
    try:
        _port = parsed.port
    except ValueError as exc:
        return f"malformed port: {exc}"
    return parsed._replace(scheme=scheme)


def _normalize_host(host: str) -> str | None:
    stripped = host.strip().rstrip(".").lower()
    if not stripped:
        return None
    try:
        return stripped.encode("idna").decode("ascii")
    except UnicodeError:
        return None


def _url_with_host(parsed: SplitResult, host: str) -> str:
    port = parsed.port
    default_port = _DEFAULT_PORTS.get(parsed.scheme)
    if port is None or port == default_port:
        netloc = _format_host(host)
    else:
        netloc = f"{_format_host(host)}:{port}"
    return urlunsplit((parsed.scheme, netloc, parsed.path or "/", parsed.query, ""))


def _origin_for(parsed: SplitResult, host: str) -> str:
    port = parsed.port
    default_port = _DEFAULT_PORTS.get(parsed.scheme)
    if port is None or port == default_port:
        return f"{parsed.scheme}://{_format_host(host)}"
    return f"{parsed.scheme}://{_format_host(host)}:{port}"


def _format_host(host: str) -> str:
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return host
    if isinstance(ip, ipaddress.IPv6Address):
        return f"[{ip.compressed}]"
    return ip.compressed


def _is_localhost_target(host: str) -> bool:
    if host in _LOCALHOST_NAMES:
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return ip.is_loopback


def _public_ip_decision(address: str) -> str | None:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return f"resolved address {address!r} is malformed"
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if not ip.is_global:
        return f"resolved address {address} is not public"
    return None


def _blocked(
    reason: str,
    normalized_url: str | None = None,
    origin: str | None = None,
) -> BrowserUrlDecision:
    return BrowserUrlDecision(
        False,
        normalized_url=normalized_url,
        origin=origin,
        reason=reason,
    )
