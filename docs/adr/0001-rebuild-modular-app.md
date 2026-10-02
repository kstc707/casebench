# ADR 0001: Rebuild the modular app from the architecture doc

## Status
Accepted — in progress.

## Context
An earlier session scaffolded a full modular Next.js/Postgres app (domain
entities, event-log state machine, content-as-data role packs, hybrid
evaluation) but that work lived only in a temporary session environment and
was lost before being committed to git. Only a single-file HTML/JS prototype
and the architecture notes survived.

## Decision
Rebuild the modular app directly in this repo (`apps/web`, `packages/domain`,
`packages/database`, `packages/ai`, `packages/simulation-engine`), following
`docs/architecture.md`, using the prototype purely as a behavioral reference
(not a structural one), and commit as we go instead of at the end.

## Consequences
- The example role-pack content (`content/role-packs/data-analyst/.../watch-time-decline/`)
  currently uses **placeholder data and a placeholder truth model** — the
  originals were lost along with the rest of the prior scaffold. This is
  explicitly flagged in that folder's `NOTE.md` and in `simulation.json`
  itself, so it isn't mistaken for real, verified content later.
- The Next.js app currently only renders a dashboard + a stub problem page.
  The data explorer / SQL sandbox, manager chat, code editor + test runner,
  and evaluation flow all still need to be ported from the prototype.
- AI calls now happen server-side (`packages/ai/src/anthropicProvider.ts`)
  instead of from the browser, which was the prototype's main limitation
  (it only worked inside an authenticated Claude session).
