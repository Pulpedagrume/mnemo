# CLAUDE.md — working notes for AI agents and contributors

Mnemo is a local-first spaced-repetition app (PWA + optional server, CLI, MCP) with an AI-friendly
import pipeline. The full product spec lives in the original build prompt; the actionable version is
`docs/PLAN.md` (phases and checkboxes) and `docs/DECISIONS.md` (ADR log). **Read both before resuming
work**, then continue from the first unchecked task.

## Commands

```bash
pnpm install              # Node >= 22.12, pnpm 9 (see packageManager)
pnpm dev                  # web app on http://localhost:5173
pnpm lint                 # ESLint (type-aware), zero warnings allowed
pnpm typecheck            # tsc in every workspace
pnpm test                 # Vitest, all projects (packages/*, apps/*, scripts)
pnpm test:coverage        # same, with v8 coverage of packages/*
pnpm e2e                  # Playwright (apps/web/e2e), builds + previews the web app
pnpm build                # build apps (web: Vite, cli: tsdown)
pnpm knip                 # dead code / unused deps
pnpm check:licenses       # dependency license allowlist
pnpm format               # Prettier
pnpm check                # format:check + lint + typecheck + test + build
pnpm rename-app <Name>    # rename the app everywhere (keeps the `mnemo/1` format id)
```

Single test file: `pnpm vitest run packages/core/src/foundations.test.ts`.
Single e2e: `pnpm --filter @mnemo/web exec playwright test e2e/smoke.spec.ts`.

## Repository layout

```
packages/core       pure domain (models, schedulers, queue, stats, simulator). No DOM, no Node, no deps on other packages.
packages/importers  format detection, cleanup, parsers, validation, reports, exports      (-> core)
packages/prompts    AI prompt templates + composer                                        (-> importers, core)
packages/storage    Repository interface, Dexie + SQLite implementations, conformance suite (-> core)
packages/sync       sync protocol and merge rules                                         (-> core)
apps/web            React 18 PWA (Vite, Tailwind 4, i18next)
apps/server         Fastify API (phase 3)
apps/cli            `mnemo` CLI (commander, bundled with tsdown)
apps/mcp            MCP server (phase 4)
prompts/{fr,en}     prompt templates read by packages/prompts
schema/             generated JSON Schema
docs/ examples/ scripts/ .github/
```

Workspace packages are **internal source packages**: `exports` points to `src/index.ts`, there is no
build step for them. Apps bundle them (Vite for web, tsdown for Node apps). Config files loaded
directly by Node (e.g. `vite.config.ts`) must import workspace code by relative path with a `.ts`
extension.

## Rules (non-negotiable)

- TypeScript strict; no `any` (an exception needs `// eslint-disable-next-line ... -- reason`).
- Modules under ~300 lines; pure functions in `packages/core`; no circular imports (`import-x/no-cycle`).
- **Never** call `Date.now()`, `new Date()` or `Math.random()` in business logic: inject `Clock` and
  `Rng` from `@mnemo/core` (enforced by ESLint in `packages/core`).
- No business logic in React components: they call services from `core`/`storage`.
- Everything from a file, an AI or the network is untrusted: validate with Zod, sanitize before display.
- No code copied from Anki (AGPL). Algorithms are written from public descriptions; FSRS via `ts-fsrs` (MIT).
- New dependencies: maintained, MIT-compatible license, justified in `docs/DECISIONS.md` if heavy.
- Code, comments, identifiers and commit messages in **English**. UI, user docs and AI prompts in
  **French (default) and English**; no hard-coded UI strings (`i18next/no-literal-string`). Both
  locale files must have identical keys (tested).
- IDs: UUIDv7 strings. Dates: epoch milliseconds UTC. Study days via `dayIndex(now, tz, rolloverHour)`.
- `APP_NAME` / `APP_SLUG` in `packages/core/src/app.ts` are the only source of the app name.
- Accessibility: WCAG AA, full keyboard, visible focus, never convey meaning by color alone.

## Workflow

1. Work phase by phase (`docs/PLAN.md`). A task is done when it has typed code, tests (unit, and
   e2e for user journeys), up-to-date docs, fr+en strings, green CI.
2. End of each phase: `pnpm check && pnpm e2e` green, `docs/PLAN.md` ticked, Conventional Commits.
3. Do not ask about details: pick the default/simplest reversible option and log it in
   `docs/DECISIONS.md` (ADR format). Stop only for irreversible or costly decisions.
4. **Never publish**: no `git push`, no remote repo creation, no deployment.
5. Long sessions: commit, compact, then re-read this file and `docs/PLAN.md`.

## Gotchas

- `pnpm licenses` is a built-in pnpm command: the script is `pnpm check:licenses`.
- Line endings are LF (`.gitattributes`); Prettier enforces `endOfLine: lf`.
- `prompts/`, `packages/importers/fixtures/` and `examples/ai-outputs/` are byte-exact test inputs and
  are excluded from Prettier.
