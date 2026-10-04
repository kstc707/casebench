# Roadmap

## Built (in the prototype)

- [x] Problem dashboard across 3 role tracks (Data Analyst, Data Scientist, Software Engineer)
- [x] Case-study workspace: brief, data explorer, resources, journal, discussion tabs
- [x] In-browser SQL sandbox over embedded CSVs
- [x] Coding workspace: code editor + deterministic test runner
- [x] AI manager chat persona per company
- [x] Rubric-based AI evaluation (case studies) and hybrid deterministic + AI evaluation (coding)
- [x] "Concepts you'll practice" callouts per problem
- [x] Portfolio summary generation
- [x] Hidden truth-model isolation, verified not to leak to the client

## Next

- [x] Scaffold the modular Next.js + Postgres app from `docs/architecture.md` — domain entities,
      event-log state machine, Postgres schema + immutability triggers, AI provider abstraction,
      content loader with truth-model stripping, dashboard + stub problem page (see
      `docs/adr/0001-rebuild-modular-app.md`)
- [x] Replace the placeholder watch-time-decline data/truth model with a seeded generator +
      independent analyzer + tests proving the truth model holds (build log 02)
- [ ] Port the data explorer / SQL sandbox from the prototype into the problem page
- [ ] Port the manager chat (using `packages/ai`'s prompt builders) into the problem page
- [ ] Port the code editor + deterministic test runner for the coding track
- [ ] Wire up the submission + evaluation flow end-to-end (case-study and coding)
- [ ] Add the second role-pack content (data-scientist/experiment-readout,
      software-engineer/dedupe-session-events) using the same structure
- [x] Wire Postgres into the app: numbered migrations + runner, run repository with row-locked
      appends, `/api/runs` routes, anonymous cookie identity, start/resume on the problem page,
      CI with a Postgres service (typecheck, tests, build)
- [ ] Account system + persistent portfolio (currently a single in-session run)
- [ ] More companies/role tracks beyond the current StreamWave-based set
- [ ] Decide on a stable product name (working names so far: "Project Codename", "Casebench")

## Open questions

- How much of the manager-persona hint policy should be user-configurable (e.g. "harder mode")?
- Should the coding track support languages beyond JS, and if so, how does the deterministic
  test runner generalize safely?
