---
title: Agent Browser Use In Omnigent
status: draft
created: 2026-06-30
updated: 2026-06-30
owner: unassigned
repo: omnigent
---

# Plan: Agent Browser Use In Omnigent

## Summary

Add Codex-style agent browser use to Omnigent as a runner-owned Playwright browser resource with a visible Browser rail panel. V1 supports unauthenticated local/public pages, agent-driven navigation and interaction, screenshots, and live user visibility.

This is not signed-in Chrome reuse, browser extensions, existing browser-tab control, or Computer Use. Those remain follow-up features.

## Product Contract

### PC-1: Agents Can Use A Browser

Agents can open and interact with a session-scoped browser from tools.

Acceptance:

- Agent tools can open a URL, click, type, press keys, read a snapshot, capture a screenshot, and close the browser.
- Browser state is scoped to the owning session.
- Browser cleanup runs when session resources are cleaned/reset.
- Tool calls serialize per browser so click/type/screenshot calls cannot corrupt one page state.

### PC-2: Users Can See Browser State

When a browser exists, Omnigent shows it in the workspace rail.

Acceptance:

- A Browser tab appears when a browser resource exists.
- The panel shows current URL, title, loading/error state, and latest screenshot.
- The panel updates while the agent navigates or interacts.
- Closing the browser removes the Browser tab.

### PC-3: Browser Use Is Conservative By Default

V1 avoids signed-in and persistent browser state.

Acceptance:

- Browser contexts are ephemeral by default.
- No regular Chrome profile, extensions, existing cookies, persistent storage, or signed-in browser state is used.
- Allowed navigation targets are localhost loopback URLs and ordinary public `http`/`https` pages.
- Missing Playwright or missing Chromium returns a clear setup error with install guidance.

## Planning Contract

### Current Repo Surfaces

- `omnigent/entities/session_resources.py` defines resource ids/views and currently supports `environment`, `terminal`, and `file`.
- `omnigent/runner/resource_registry.py` owns runner-side session resources and terminal lifecycle.
- `omnigent/server/routes/sessions.py` proxies typed resource routes such as `/resources/terminals` and persists resource lifecycle events.
- `omnigent/tools/manager.py` controls agent-visible builtin registration; new `sys_*` tools must be explicitly enabled there or via an agent spec gate.
- `omnigent/runner/tool_dispatch.py` controls runner-local builtin dispatch; new tools must be added to the allow/dispatch path.
- `web/src/lib/sse.ts`, `web/src/lib/events.ts`, and `web/src/store/chatStore.ts` parse and apply session events.
- `web/src/hooks/useTerminals.ts` is the closest hook pattern for browser inventory.
- `web/src/shell/railTabs.ts`, `AppShell.tsx`, and `WorkspacePanel.tsx` own right-rail tab behavior.

### Fixed Decisions

- Browser is a first-class session resource type named `browser`.
- V1 supports one default browser per session, addressed as `browser_default`.
- Browser tools are gated by a new top-level agent spec field, `browser: true`, parsed into `AgentSpec.browser: bool = False`; they are not globally always-on.
- Python Playwright is shipped as an optional runtime extra, `omnigent[browser]`; dev/test dependencies alone are not treated as runtime support.
- Browser state is runner-owned and ephemeral. Server persistence is limited to resource lifecycle events; live URL/title/loading/screenshot updates are transient. Reconnect source of truth is the HTTP seed from `GET /v1/sessions/{id}/resources/browsers`, which `AppShell` always mounts for the active session.
- Browser screenshots are served through authenticated server proxy routes, not directly from the runner.
- Direct user click/type in the Browser panel is out of scope for v1; the visible panel is an observation surface plus close/open-in-system-browser controls.

## Security And Navigation Policy

V1 must implement a concrete `BrowserUrlPolicy` service and enforce it before navigation plus inside Playwright request interception.

Allowed:

- `http://localhost:*`
- `http://127.0.0.1:*`
- `http://[::1]:*`
- Public `http` and `https` URLs whose normalized hostname resolves only to public IPs. Public means not private, loopback, link-local, multicast, carrier-grade NAT, documentation, benchmark, unspecified, reserved, or cloud metadata ranges. Localhost loopback is the only exception.

Blocked:

- `file:`, `data:`, `javascript:`, `about:`, `blob:`, custom schemes, and extension schemes.
- Redirects from an allowed public URL to blocked schemes or private/reserved IP ranges.
- Private network targets such as RFC1918 addresses, link-local addresses, cloud metadata addresses, and Unix sockets.
- Downloads in v1.
- WebSocket requests in v1.
- Service worker registration and requests in v1.

Policy mechanics:

- Add `BrowserUrlPolicy.check_url(url, *, allow_localhost: bool, approved_external_hosts: set[str]) -> BrowserUrlDecision`.
- Normalize URLs with the standard URL parser before policy checks: lowercase schemes/hosts, resolve punycode/IDNA hostnames, reject embedded credentials, normalize default ports, and reject malformed or ambiguous hosts.
- Resolve DNS inside `BrowserUrlPolicy` with a short TTL cache. All returned A/AAAA records must pass the IP classifier. A single private/reserved result blocks the host.
- Classify IPv4, IPv6, and IPv6-mapped IPv4 addresses with the same reserved-range rules. Explicitly block `169.254.169.254`, `metadata.google.internal`, and equivalent cloud metadata targets.
- Re-check the target on every top-level navigation, redirect, iframe navigation, image/script/style/font/media load, XHR/fetch request, and form submission. For v1, allow public third-party subresources only if each subresource independently passes `BrowserUrlPolicy`; do not require per-subresource approval.
- Abort blocked Playwright routes before the request is sent. Return a browser error state naming the blocked URL and reason.
- DNS rebinding defense: re-resolve and re-classify on every navigation/request decision, not only on initial approval; do not trust a previous public result for a later request.
- Disable downloads with Playwright context/page handlers. Disable service workers with the browser context option where Playwright supports it and still block any service-worker request observed by routing.

Approval:

- First top-level navigation to a non-localhost external host is approved by AP-server policy before the runner receives the executable tool request. `sys_browser_open` must not launch or navigate Playwright until that approval is complete.
- Implement this as a pre-dispatch policy gate in the same AP server tool-call policy/elicitation path used for other tool calls: `sys_browser_open` carries the normalized target origin in the policy context, and an approval stores a session-scoped allowed external host.
- The runner treats missing approval for a non-localhost external origin as an error and returns without creating a page.
- Approval timeout/cancel returns a denied tool result and does not call the runner browser manager.
- Redirects and subresources are still checked by `BrowserUrlPolicy`; approval of an origin does not allow private-network redirects or blocked schemes.

Screenshot safety:

- Browser screenshots are session-scoped resources requiring at least read access to the session.
- Screenshots are not embedded into tool result text; tools return metadata and the UI fetches the authenticated image endpoint.

## Implementation Units

### U-1: Browser Resource Model

Files:

- `omnigent/entities/session_resources.py`
- `omnigent/server/schemas.py`
- `web/src/lib/events.ts`
- `web/src/lib/sse.ts`

Tasks:

- Add `browser` to resource type unions and schema literals.
- Add `browser_resource_id(session_key: str = "default") -> str`, returning `browser_default` for v1.
- Add `browser_resource_view(session_id, state)` with metadata:
  - `url`
  - `title`
  - `loading`
  - `error`
  - `screenshot_version`
  - `created_at`
  - `updated_at`
- Ensure `session_resource_view_to_dict` handles browser resources without terminal-only fields.
- Ensure frontend SSE resource parsing accepts browser resources.
- Add tests for `browser_resource_id`, browser metadata projection, `filter_resources_by_type(..., "browser")`, and strict API schema validation.

Acceptance:

- Browser resources validate through server and frontend schemas.
- Existing terminal/file/environment resource tests still pass.

### U-2: Runner Browser Manager And Inventory

Files:

- `omnigent/runner/resource_registry.py`
- New browser manager module under `omnigent/runner/` or `omnigent/browser/`

Tasks:

- Add `BrowserUrlPolicy` and IP/URL classification helpers alongside the browser manager; keep them independently unit-testable without Playwright.
- Create an ephemeral Playwright Chromium context and page per session when the browser is first created or used.
- Configure the Playwright context with no persistent profile, no downloads, blocked service workers where supported, and route interception for all requests.
- Store browser state in a runner-owned manager keyed by session id and browser id.
- Add browser resources into `SessionResourceRegistry.list_resources()`, `get_resource()`, filtering by `type=browser`, and session cleanup.
- Add per-browser `asyncio.Lock` serialization for page operations.
- Add operation timeouts:
  - navigation: 30 seconds
  - click/type/key/snapshot/screenshot: 10 seconds
- Define close-during-action behavior: close waits for the active operation lock, then closes the context and removes state.
- Publish browser state updates after navigation, click/type/key when state changes, screenshot refresh, and errors.
- Enforce `BrowserUrlPolicy` on every Playwright route before continuing the request.

Acceptance:

- Browser manager works with mocked Playwright in unit tests.
- `BrowserUrlPolicy` blocks malformed URLs, blocked schemes, private/reserved IPs, cloud metadata hosts, IPv6-mapped private addresses, DNS rebinding, WebSockets, service workers, and private redirects.
- Missing `playwright` package and missing Chromium executable produce distinct actionable errors.
- `list_resources(type="browser")` returns active browser resources.
- Session cleanup closes active browser contexts.

### U-3: Server Resource Routes And Screenshot Contract

Files:

- `omnigent/server/routes/sessions.py`
- Runner app resource routes

Tasks:

- Add typed routes:
  - `GET /v1/sessions/{id}/resources/browsers`
  - `POST /v1/sessions/{id}/resources/browsers`
  - `GET /v1/sessions/{id}/resources/browsers/{browser_id}`
  - `DELETE /v1/sessions/{id}/resources/browsers/{browser_id}`
  - `GET /v1/sessions/{id}/resources/browsers/{browser_id}/screenshot?v={screenshot_version}`
- Require session read access for list/get/screenshot and edit access for create/delete.
- Require JSON content type on create, matching existing mutable resource routes.
- Proxy screenshot bytes through the server with:
  - `Content-Type: image/png`
  - `Cache-Control: no-store`
  - max screenshot response size of 5 MB
  - 404 when browser or screenshot is missing
  - 502 when runner screenshot fetch fails
- Publish and persist `session.resource.created/deleted` for browser lifecycle.
- Do not persist `session.browser.updated`; it is transient and reconciled by resource snapshots.
- Add `GET /v1/sessions/{id}/resources/browsers` to the server-side runner proxy and to the runner app, with pagination semantics matching terminal typed resources where practical.

Acceptance:

- Browser resources can be created/listed/fetched/deleted through the API.
- Screenshot endpoint returns authenticated PNG bytes and does not cache stale images.
- Browser lifecycle appears after reconnect via the browser HTTP seed.

### U-4: Browser Update Event

Files:

- `omnigent/server/schemas.py`
- `web/src/lib/events.ts`
- `web/src/lib/sse.ts`
- `web/src/store/chatStore.ts`
- New `web/src/hooks/useBrowsers.ts`

Tasks:

- Add `session.browser.updated` SSE event shape:
  - `type: "session.browser.updated"`
  - `session_id`
  - `browser_id`
  - `url`
  - `title`
  - `loading`
  - `error`
  - `screenshot_version`
  - `updated_at`
- Add it to `ServerStreamEvent`.
- Parse it in `web/src/lib/sse.ts`.
- Add a browser query key and `BrowserInfo` mapper mirroring terminal cache patterns.
- Patch browser query cache in `chatStore` on resource created/deleted and browser updated.
- `useBrowsers(sessionId)` seeds active browser state from `GET /resources/browsers` and remains mounted in `AppShell` for the active session even when the Browser tab is hidden.
- Stream reconnect does not need a browser replay event because the always-mounted HTTP seed is the source of truth; `session.browser.updated` only patches fresh state between seeds.

Acceptance:

- Browser tab state updates without a page refresh.
- Reconnecting the SSE stream recovers current browser resources and latest metadata.
- Duplicate created/updated events are idempotent.

### U-5: Agent Browser Tools

Files:

- New `omnigent/tools/builtins/sys_browser.py`
- `omnigent/tools/manager.py`
- `omnigent/runner/tool_dispatch.py`
- `omnigent/spec/types.py`
- `omnigent/spec/parser.py`
- `docs/AGENT_YAML_SPEC.md`

Tasks:

- Add top-level agent spec field `browser: true`, parsed into `AgentSpec.browser: bool = False`; do not introduce a generic `capabilities:` map in v1.
- Document `browser: true` in `docs/AGENT_YAML_SPEC.md`.
- Register browser tools only when the session agent has `browser: true`.
- Add `_BROWSER_TOOLS` to the runner-local tool allow sets in `omnigent/runner/tool_dispatch.py`.
- Add browser tools to `_ALL_LOCAL_TOOLS` and to `_NATIVE_RELAY_BUILTIN_TOOLS` when `AgentSpec.browser` is true, so native sessions can receive the same schemas.
- Add schema-builder tests for `build_native_relay_tool_schemas(spec)` with `browser: true` and `browser: false`.
- Add runner-local dispatch for:
  - `sys_browser_open({ "url": string })`
  - `sys_browser_snapshot({})`
  - `sys_browser_click({ "x": number, "y": number })`
  - `sys_browser_type({ "text": string })`
  - `sys_browser_key({ "key": string })`
  - `sys_browser_screenshot({})`
  - `sys_browser_close({})`
- Return concise JSON with `browser_id`, `url`, `title`, `loading`, `screenshot_version`, and `status`.
- Run AP-server policy/elicitation approval before runner dispatch for external top-level `sys_browser_open` targets. The runner repeats `BrowserUrlPolicy` checks and refuses unapproved external origins as defense in depth.
- If approval is denied, times out, or the turn is cancelled, return a denied tool result without creating or navigating a browser.
- Do not return base64 screenshots in tool output; return metadata only.

Acceptance:

- Browser tools are visible only for agents that opt into browser capability.
- Runner-local browser dispatch also enforces `AgentSpec.browser is True`; schema gating alone is not sufficient because direct runner dispatch must not bypass the default-off capability.
- Parser/spec tests prove `browser` defaults to `False` and accepts top-level `browser: true`.
- Native relay schema tests prove browser tools are exposed only when `AgentSpec.browser` is true.
- Approval tests prove non-localhost Playwright navigation is not attempted before approval.
- Tool calls execute on the runner browser manager.
- Browser-created and browser-updated events update the UI.

Implementation note, 2026-06-30:

- Completed backend foundation covers resource/schema projection, URL policy, typed runner/server browser routes, screenshot proxy contract, `browser: true` parser/schema registration, native relay gating, and dispatch-level opt-in enforcement.
- Full `sys_browser_click`, `sys_browser_type`, and `sys_browser_key` behavior remains deferred until the Playwright browser manager lands; these tools should not be treated as complete merely because schemas exist.

### U-6: Browser Rail Panel

Files:

- `web/src/shell/railTabs.ts`
- `web/src/shell/AppShell.tsx`
- `web/src/shell/WorkspacePanel.tsx`
- New `web/src/hooks/useBrowsers.ts`
- New `web/src/shell/BrowserPanel.tsx`

Tasks:

- Add `browser` to `RightRailTab`.
- Always call `useBrowsers(conversationId)` from `AppShell` for the active session. Add browser tab availability when the seeded or live-updated browser list has at least one browser resource.
- Add Browser tab in display order after Files and before Agents.
- Render URL, title, status, latest screenshot, refresh screenshot, open-in-system-browser, and close controls.
- Fetch screenshots from `/resources/browsers/{browser_id}/screenshot?v={screenshot_version}`.
- Use fixed screenshot aspect-ratio and stable panel layout to avoid shifting.
- Keep direct user click/type disabled in v1.

Acceptance:

- Browser tab appears only when browser resources exist.
- Reloading or reconnecting a session with an active browser shows the Browser tab from the HTTP seed without waiting for a new SSE event.
- Screenshot and URL update after browser actions.
- Closing browser removes the browser resource from the rail.
- Existing Files, Agents, Shells, and Tasks tab fallback behavior remains stable.

### U-7: Packaging And Install Guidance

Files:

- `pyproject.toml`
- Relevant docs or error text near browser manager setup

Tasks:

- Add optional extra `browser = ["playwright>=1.50,<2"]`.
- Add setup guidance in the browser missing-dependency error:
  - install package: `uv pip install -e '.[browser]'` or project-equivalent
  - install Chromium: `uv run playwright install chromium`
- Keep dev/test Playwright dependencies separate from runtime browser support.

Acceptance:

- A default install without `omnigent[browser]` still works.
- Browser tool calls fail clearly when runtime support is missing.
- Browser-enabled local installs can launch Chromium.

## Non-Goals

- Signed-in Chrome/profile reuse.
- Browser extensions.
- Existing browser tab control.
- Full user-agent shared interactive control from v1.
- Arbitrary JavaScript eval.
- Downloads as browser artifacts.
- Computer Use or OS-level automation.
- Persistent browser history, cookies, or storage across sessions.

## Testing And Verification

- Python unit tests for resource projection, resource filtering, URL policy, redirect blocking, missing dependency handling, operation locking, timeout behavior, and cleanup.
- URL policy tests must cover top-level navigation, redirects, iframes, image/script/style/font/media subresources, XHR/fetch, WebSocket blocking, service worker blocking, DNS rebinding, IPv6-mapped IPv4, metadata IPs/hosts, punycode/IDNA normalization, embedded credentials rejection, and malformed URLs.
- Server route tests for browser create/list/get/delete/screenshot, access levels, content type requirements, and proxy error mapping.
- Tool tests using a mocked browser manager for all `sys_browser_*` tools, browser capability gating, native relay schemas, and external-host approval before navigation.
- Spec/parser tests for top-level `browser: true`.
- SSE tests for `session.browser.updated` schema validation, parsing, idempotent cache updates, and HTTP seed recovery.
- Frontend unit tests for `useBrowsers`, Browser tab visibility, Browser panel screenshot URL versioning, close behavior, and rail fallback.
- E2E test with a local HTML page where an agent opens the page, types/clicks, and the Browser rail screenshot updates.
- Regression checks for terminal resources, file resources, notebook preview, and existing rail tab behavior.

## Risks

- Playwright adds runtime weight; keep it optional and fail clearly when unavailable.
- Browser navigation can become a network escape hatch; enforce URL policy at both tool/REST boundaries and Playwright request interception.
- Screenshot updates can become expensive; use event-driven `screenshot_version` and avoid steady-state polling.
- Shared user control can create race conditions with agent actions; defer direct user click/type in v1.
- Resource snapshots can drift from transient update events; always reconcile from runner resource state after reconnect.

## Implementation Order

1. Add resource model and browser manager with mocked Playwright tests.
2. Add runner/server browser routes and lifecycle events.
3. Add `session.browser.updated` parsing and browser cache hooks.
4. Add browser tool schemas, capability gate, and runner dispatch.
5. Add Browser rail panel and screenshot endpoint consumption.
6. Add packaging extra and missing-dependency guidance.
7. Add E2E coverage and run regression checks.
