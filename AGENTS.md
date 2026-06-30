# Agent guidance

Guidance for AI agents (Claude Code, Copilot, Cursor, etc.) working in this
repository. See `CONTRIBUTING.md` for the full contributor workflow.

## Pull requests

This checkout is normally used for Adam's fork-local work, not direct upstream
open-source merges.

- Treat `clive-claw/omnigent:local/clive-claw` as the default PR base and merge
  target for local work.
- Do not open, merge, or retarget PRs against `omnigent-ai/omnigent` unless the
  user explicitly asks for an upstream open-source PR.
- If multiple local PRs are stacked or related, merge/update them in dependency
  order against `local/clive-claw`, then rebase later PR branches onto the
  refreshed `origin/local/clive-claw` before pushing with `--force-with-lease`.
- Before any merge, state the exact repository and base branch, for example
  `clive-claw/omnigent:local/clive-claw`, and stop if the user's intent is
  ambiguous.

When you open a pull request, fill in the repo's PR template at
`.github/pull_request_template.md` (case-sensitive on Linux — note the lowercase
filename). Keep every section and checkbox row so reviewers can skim them.

- **Summary** — what changed and why.
- **Test Plan** — how you verified it.
- **Demo** — a **video or images** showing the change. Expected on contributor
  PRs for UI / frontend changes (check the "UI / frontend change" box under
  *Type of change*) so reviewers can see the new behaviour without checking out
  the branch. Use `N/A` for non-visual changes.
- **Type of change** / **Test coverage** — check all that apply (at least one
  each).
- **Coverage notes** — required if you checked "Manual verification completed"
  or "Not applicable".

Generate the description from the actual diff and this session's context — lead
with the motivation, then the change. Don't pass a `--body` that skips these
sections.
