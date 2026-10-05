# Roadmap

## Done

- [x] Run backbone: Postgres event log, migrations, run API, anonymous identity (build log 01)
- [x] Seeded StreamWave dataset with a truth model proven by tests (02)
- [x] Workspace with DuckDB-WASM SQL sandbox; every query logged (03)
- [x] AI coworkers: personas, split knowledge, proactive triggers, hint levels, leak guard (04)
- [x] Grader agent with structured outputs; public portfolio page (05)
- [x] Agent eval script (adversarial probes, leak rate before/after guard)
- [x] Any AI provider incl. free tiers; browser-only deploys (06)
- [x] Slack-first dark UI (07)
- [x] Scenario Studio + multi-role engine + UX-designer case (08)
- [x] Community layer: discovery, likes, ratings, comments, solver stats, complexity score, "I'm stuck" (09)

## Next (in priority order)

- [ ] **AI-assisted creation**: "describe the simulation you want" → a validated draft in the Studio (biggest creator-side friction)
- [ ] Accounts (replace per-browser identity) so creators and solvers keep their history across devices
- [ ] 5–10 very different simulations (incident debugging, security investigation, product decision, operations)
- [ ] New environment types: log viewers, file trees, mock APIs, branching decisions

- [ ] Deploy (Vercel + Neon) and run the agent eval with a real key; commit the report
- [ ] Rate limiting on AI-backed routes before sharing the link publicly
- [ ] Grader calibration set: hand-graded strong / weak / confidently-wrong submissions
- [ ] Usage analytics view: how real users approach the case (did they dedupe? ask Sam?)
- [ ] Moderation for Community listings (report / owner approval) and rate limits on scenario creation
- [ ] Port the coding track (editor + deterministic test runner) from the prototype
- [ ] Accounts + multi-run portfolios (replace the anonymous cookie)
- [ ] Server-sent events instead of polling, if concurrency grows

## Open questions

- Should hint policy be user-configurable ("harder mode")?
- Voice: a spoken stand-up with the manager (speech-to-text in, text-to-speech out)?
