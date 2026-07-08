# CLAUDE.md

Guidance for Claude Code when working in this repository.

**Read [AGENTS.md](./AGENTS.md) first.** It is the canonical, actively-maintained guide for
contribution conventions in this repo (scenario design rules, check conventions, SEP/PR review
process). This file does not restate it — it gives you the orientation AGENTS.md assumes you
already have: where things live, how to build/test, and how the pieces fit together. If the two
ever disagree, AGENTS.md wins; update this file to match rather than the reverse.

## What this repo is

`@modelcontextprotocol/conformance` — a test harness that exercises MCP (Model Context Protocol)
client and server implementations against the protocol spec. It is not a library consumed by
end-user apps; it's a CLI (`npx @modelcontextprotocol/conformance`) plus a corpus of test
scenarios. The metric that matters is **spec coverage** (how much of the protocol the scenarios
exercise), not code coverage of this repo itself.

This checkout is a fork of `modelcontextprotocol/conformance`; upstream URLs (README badges,
`repository.url` in package.json, GitHub Action references) still point at the upstream org.

## Tech stack

- TypeScript, ESM (`"type": "module"`), **npm only** — never commit `pnpm-lock.yaml` or
  `yarn.lock`.
- Build: `tsdown` → single-file `dist/index.js` targeting Node 20.
- Typecheck: `tsgo` (`@typescript/native-preview`), not plain `tsc`.
- Lint/format: ESLint flat config (`eslint.config.mjs`) + Prettier.
- Tests: Vitest.
- Git hooks: `lefthook` (pre-push runs `lint:fix_check` + `test`).
- Runtime deps of note: `@modelcontextprotocol/sdk`, `express` (mock HTTP servers), `zod`
  (schemas), `commander` (CLI), `jose` (OAuth/JWT), `yaml` (SEP files), `@octokit/rest`.

## Commands

```bash
npm install
npm run build          # tsdown → dist/index.js
npm test                # vitest run
npm run test:watch      # vitest watch mode
npm run check           # typecheck + lint (what CI gates on, besides build/test)
npm run typecheck       # tsgo --noEmit
npm run lint            # eslint + prettier --check
npm run lint:fix        # eslint --fix + prettier --write

# Run the CLI from source (no build step needed):
npm start -- client --command "tsx examples/clients/typescript/everything-client.ts" --scenario initialize
npm start -- server --url http://localhost:3000/mcp --scenario server-initialize
npm start -- list

# Run the local conformance build against a real SDK checkout (clones/caches under .sdk-under-test/):
npm start -- sdk typescript-sdk --mode client
npm start -- sdk --path ../typescript-sdk --skip-build --mode server --scenario server-initialize

# SEP traceability manifest (src/seps/traceability.json)
npm run traceability -- --results <results-dir>

# SDK tier assessment (SEP-1730)
npm run --silent tier-check -- --repo <owner/repo> --skip-conformance
```

CI (`.github/workflows/ci.yml`) runs on Node 24: `npm ci && npm run check && npm run build && npm test`.
There is no `.github/pull_request_template.md` in this repo.

## Directory map

```
src/
  index.ts              CLI entrypoint (Commander.js) — client / server / sdk / list /
                         tier-check / traceability / new-sep subcommands
  types.ts              Scenario, ClientScenario, ConformanceCheck — the core shared types
  schemas.ts            Zod schemas
  expected-failures.ts  Baseline (known-failures) YAML handling

  runner/                Orchestrates a test run and writes results/<scenario>-<ts>/{checks.json,stdout.txt,stderr.txt}
    client.ts, server.ts, authorization-server.ts, utils.ts
    DESIGN.md            Longer architecture writeup — read this for the runner internals

  scenarios/              The actual test content — this is what most contributions touch
    index.ts              Registers every scenario into suites: core, extensions, backcompat,
                           auth, metadata, draft, sep-<NNNN>, ...
    client/                Scenarios where the harness runs a mock server and drives a
                           real MCP client under test (implements `Scenario`)
      auth/                OAuth flows (DCR, PKCE, token refresh, issuer validation, ...)
    server/                Scenarios where the harness acts as an MCP client against a
                           real server under test (implements `ClientScenario`)
      tasks/               Long-running task lifecycle scenarios
    authorization-server/  Scenarios exercising the OAuth authorization server role
    untestable.ts          notTestable()/untestableCheck() helpers — see "Untestable checks" below

  checks/                Pure conformance-check builder functions, reused across scenarios
  connection/            MCP client connection helpers (stateful/stateless, SDK-backed)
  mock-server/           Reusable mock-server scaffolding (stateful/stateless variants)
  seps/                  One sep-<NNNN>.yaml per SEP: requirement-traceability source of truth
    traceability.json    GENERATED — do not hand-edit; refreshed by npm run traceability
                          or the traceability.yml workflow
  new-sep/               Implementation behind `new-sep <NNNN>` CLI subcommand
  sdk-runner/            Implements `sdk <name>[@ref]` — clone/build/run a real SDK checkout;
    known-sdks.ts         per-SDK build/run command registry (the thing to edit to add an SDK)
  tier-check/            SEP-1730 SDK tier scorecard logic
  traceability/           Builds traceability.json from a suite run's checks.json files
  spec-types/            Generated/vendored TS types per protocol spec version (+ draft)

examples/
  clients/typescript/    Reference + scenario-specific example clients.
                         everything-client.ts is the one real SDKs should be modeled after;
                         most new scenarios should extend it rather than adding a new file.
  servers/typescript/    Reference + negative-test example servers (deliberately broken variants
                         used to prove a check catches real failures, e.g. sep-2106-stripped-schema.ts)

.claude/skills/          Claude Code skills scoped to this repo (see below)
.github/workflows/       ci.yml, pr-publish.yml (npm publish on release), traceability.yml
scripts/sync-schema.ts   Pulls spec JSON Schema into src/spec-types
```

## Architecture in one paragraph

A **scenario** is either a `Scenario` (harness spins up a mock HTTP server, spawns/drives a real
client against it — `src/scenarios/client/**`) or a `ClientScenario` (harness connects to a
real server under test as an MCP client — `src/scenarios/server/**`). Each scenario's `getChecks()`
returns `ConformanceCheck[]` (`src/types.ts`), consumed by `src/runner/{client,server}.ts` to
produce `results/.../checks.json` and a process exit code. Suites in `src/scenarios/index.ts`
group scenarios for `--suite` selection. Separately, `src/seps/sep-<NNNN>.yaml` files map each
RFC-2119 sentence from a SEP's spec diff to a check ID (or an `excluded:` reason); `traceability/`
cross-references those declared IDs against what a real suite run actually emits, producing
`traceability.json`, which is what plan.modelcontextprotocol.io reads to track SEP progress.

## Conventions (see AGENTS.md for the full rationale)

- **Fewer scenarios, more checks.** Merge things a real implementation would always build
  together; only split genuinely independent or mutually-exclusive features.
- **One check `id` for both SUCCESS and FAILURE** — flip `status`/`errorMessage`, don't create
  `foo-success`/`foo-failure` slugs.
- **Severity follows the spec keyword**: MUST/MUST NOT → `FAILURE`; SHOULD/SHOULD NOT →
  `WARNING` (CI treats WARNING as a failure too).
- **Untestable checks**: a missing prerequisite is a `FAILURE`/`WARNING` via
  `notTestable()`/`untestableCheck()` (`src/scenarios/untestable.ts`), not a silent SKIP — SKIPPED
  reads as green everywhere downstream, so it's reserved for genuinely inapplicable
  capabilities/spec versions.
- **Don't build a parallel runner.** New subcommands go through the existing `client`/`server`
  commands or shared helpers, not a new suite-map/summary loop.
- **Every new scenario needs a positive example** (usually extend
  `examples/clients/typescript/everything-client.ts` or the everything-server) **and a negative
  test** (a deliberately-broken example implementation + a vitest assertion that the check emits
  FAILURE/WARNING against it) — see `src/scenarios/client/auth/index.test.ts` and
  `src/scenarios/server/negative.test.ts` for the pattern.
- Register every new scenario in `src/scenarios/index.ts`.
- When verifying a SEP's requirement level, trust the **spec diff** in the SEP's PR
  (`docs/specification/draft/*.mdx` under `modelcontextprotocol/modelcontextprotocol`), not the
  SEP markdown summary or the conformance PR description.

## Claude Code skills available in this repo (`.claude/skills/`)

- **`new-sep <NNNN>`** — scaffolds `src/seps/sep-<NNNN>.yaml` from a SEP PR: runs the `new-sep`
  CLI for the skeleton, then reads the SEP's actual spec diff to fill in `requirements[]` rows
  (RFC-2119 sentences → `check:` id or `excluded:` reason), asking for sign-off on any exclusion.
  Stops at the yaml — does not write scenario `.ts` files.
- **`review-scenario`** — review checklist for a conformance PR that adds/changes scenario `.ts`
  files: cross-checks the SEP's spec diff against the traceability yaml and the scenarios
  themselves (spec backing, dead checks, coverage gaps, negative-test quality), then reports
  findings with file:line permalinks.
- **`mcp-sdk-tier-audit <local-sdk-path> <conformance-server-url> [client-cmd]`** — runs a full
  SEP-1730 tier assessment (1/2/3) against an SDK checkout: deterministic scorecard via
  `tier-check`, plus parallel doc-coverage and policy evaluations, writing an assessment +
  remediation report under `results/`.

## Gotchas

- `src/checks/server.ts` is currently an empty file — not a mistake to "fix" reflexively, just
  don't assume server-side check builders live there without checking `src/checks/index.ts`.
- `src/seps/traceability.json` is generated from a real suite run's `checks.json` output (dynamic
  check IDs resolve to concrete values), not a source scan — regenerate via `npm run traceability`
  rather than hand-editing after changing a scenario's check IDs.
- `.sdk-under-test/` holds cached clones from the `sdk` subcommand — safe to delete, gets
  refetched.
- Protocol-version-dependent lifecycle: dated versions through `2025-11-25` use the stateful
  (initialize handshake) lifecycle; the `2026-07-28` draft uses a stateless per-request `_meta`
  lifecycle — relevant to `src/connection/{stateful,stateless}.ts` and any scenario gated by
  `--spec-version`.
