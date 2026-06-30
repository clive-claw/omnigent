# Local Fork Contribution Runbook

This runbook is for using a personal Omnigent fork for local project work while
keeping useful gaps and features easy to propose upstream.

## Repository Roles

- `upstream`: the open source project, `https://github.com/omnigent-ai/omnigent.git`
- `origin`: personal fork, `https://github.com/clive-claw/omnigent.git`
- local checkout: `~/code/omnigent`

Keep `main` as a clean mirror of upstream. Do experiments, local features, and
proposal work on named branches.

## Sync The Fork

```bash
cd ~/code/omnigent
git checkout main
git fetch upstream
git merge upstream/main
git push origin main
```

If upstream moves quickly, sync before starting each new slice.

## Branch Naming

Use branch names that make intent clear:

```bash
git checkout -b local/notebook-workspace-support
git checkout -b proposal/ipynb-workspace-preview
git checkout -b docs/local-fork-notebook-runbook
```

- `local/...`: built for personal use first; may contain unfinished or pragmatic
  work.
- `proposal/...`: shaped for a possible upstream pull request.
- `docs/...`: documentation or runbook changes.

## Install And Run The Local Fork

From the repo:

```bash
cd ~/code/omnigent
uv sync --extra all --extra dev
uv run omnigent --help
```

Run a local server from the fork:

```bash
uv run omnigent server
```

In another terminal, register the local host:

```bash
uv run omnigent host --server http://localhost:6767
```

For frontend work:

```bash
cd ~/code/omnigent/web
npm install
npm run dev
```

Open the Vite URL, usually `http://localhost:5173/`.

To use the fork through the normal `omnigent` / `omni` command:

```bash
uv tool install --force --python 3.12 ~/code/omnigent
```

## Local Feature Workflow

1. Start from synced `main`.
2. Create a `local/...` branch.
3. Build the smallest local version that helps your project.
4. Keep customer data, internal URLs, notebooks, credentials, screenshots, and
   private examples out of the Omnigent repo.
5. Use generic fixtures and sample notebooks for tests.
6. Once the local feature proves useful, split it into upstream-shaped slices.

For notebook support, the preferred local progression is:

1. `.ipynb` workspace preview.
2. notebook summary extraction for agents.
3. controlled notebook execution inside the existing session environment.
4. refactor support from exploratory cells into reusable project code.

## Upstream Issue Workflow

Open an upstream issue before a larger change. The issue should be generic and
useful to Omnigent users beyond one project.

Good issue shape:

- problem or use case
- proposed first slice
- explicit follow-up scope
- alternatives considered
- affected areas

Avoid posting private project details. Use wording like "notebook-heavy research
or data-analysis projects" instead of naming a customer or internal notebook.

## Upstream Pull Request Workflow

Only open a PR after the issue has a clear first slice or you have a small,
reviewable proof of concept.

```bash
git checkout main
git fetch upstream
git merge upstream/main
git checkout -b proposal/ipynb-workspace-preview
```

Before opening a PR, run the relevant checks:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

For web UI work:

```bash
cd web
npm test
npm run lint
npm run build
```

User-facing UI changes should include a Vitest test and usually a Playwright
test under `tests/e2e_ui/`.

Commits should be signed off:

```bash
git commit -s
```

## Notebook Feature Slicing

Use this order to keep the contribution maintainable.

### Slice 1: Notebook Preview

Goal: make `.ipynb` files readable in the workspace file viewer.

Acceptance:

- `.ipynb` opens in FileViewer as a notebook preview.
- markdown cells render as markdown.
- code cells render in order with execution counts.
- plain text outputs and errors render safely.
- image outputs render when safe.
- active HTML or JavaScript outputs are suppressed or sandboxed.
- invalid notebook JSON shows a clear parse error.
- raw JSON/source view remains available.

### Slice 2: Agent Notebook Summary

Goal: help agents and reviewers understand notebook structure without reading raw
JSON.

Acceptance:

- extract cell list, imports, functions, shell commands, data reads/writes, and
  output/error summary.
- return a bounded summary suitable for chat context.
- avoid including large output payloads by default.

### Slice 3: Controlled Execution

Goal: run a notebook in the existing Omnigent session environment without
embedding JupyterLab.

Acceptance:

- run by workspace path.
- execute with `nbclient` or `nbconvert`.
- write an executed notebook artifact and execution log.
- preserve existing sandbox/workspace boundaries.
- support timeout and cancellation.
- surface success/failure clearly in the session.

## Useful Feature Log Template

Use this template before opening an upstream issue.

```markdown
## Gap

What is missing in Omnigent today?

## User Impact

Who feels this, and during what workflow?

## Existing Omnigent Surface

Which current files, APIs, UI panels, tools, or docs does this connect to?

## Smallest Useful Slice

What is the first mergeable version?

## Follow-Ups

What should explicitly not be in the first PR?

## Private Context To Exclude

What project/customer details must stay out of the issue and tests?
```
