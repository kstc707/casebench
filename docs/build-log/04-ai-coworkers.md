# 04 — AI coworkers: agents that watch the work and message you on Slack

## Goal

Make the agents the heart of the product. Each case has coworkers — a manager (Priya) and a data
engineer (Sam) — who talk to you in Slack-style DMs, **notice what you're doing**, speak up on
their own, answer questions in character, and know *different slices* of the truth, so finding
the answer means asking the right person the right question.

## Where we started

`packages/ai` had a single manager prompt and a raw `fetch` call. Nothing was wired into the app,
and there was no notion of an agent acting on its own.

## What we built

### The agent engine — `packages/agents/src/` (pure logic, fully unit-tested)

| File | Responsibility |
|---|---|
| `activity.ts` | Turns the event log into what an agent can see: time spent, tables queried, last 5 queries, resources opened, the DM transcript |
| `triggers.ts` | `dueTriggers()` — which proactive messages should fire *now*, from the log and the clock |
| `hints.ts` | `currentHintLevel()` — hints unlock by time spent or questions asked |
| `prompt.ts` | The agent's system prompt (persona, private knowledge, hint policy, rules) and per-message prompt |
| `respond.ts` | One agent turn: build context → call the model → run the leak guard |
| `guard.ts` | `applyLeakGuards()` — a deterministic regex backstop against give-aways |
| `evaluator.ts` | The grader agent (step 05) |

### The AI provider — `packages/ai/src/`

| File | Responsibility |
|---|---|
| `anthropicProvider.ts` | Calls Claude with the official SDK, server-side only |
| `mockProvider.ts` | Offline stand-in (no API key): returns canned text so every code path still runs |
| `config.ts` | Model choice and provider selection (`ANTHROPIC_API_KEY` set → Claude, else mock) |

### The content — who the agents are and what they know

| File | Visible to the browser? | Contents |
|---|---|---|
| `content/.../streamwave/personas/priya.json`, `sam.json` | name, title, role, colour only | Tone, offline reply |
| `content/.../watch-time-decline/agents.json` | **never** | What each agent knows, hint levels, rules, triggers, leak guards |

**Knowledge is split on purpose.** Priya knows the business: the campaign, the experiment, and
her own (wrong) hunch that the content catalogue is thin. Sam knows the pipeline: the mobile
5.2.0 re-send bug, fixed on Aug 3, never backfilled. Priya *doesn't* know about the bug and sends
logging questions to Sam. That's how real teams work, and it rewards asking the right person.

### The orchestrator — `apps/web/lib/agents.ts`

The glue between the engine, the model, and the database:

- `fireDueTriggers(runId)` runs after every logged action (via Next.js `after()`, so logging never
  waits on the AI) and on every Slack poll (so time-based triggers like "you've gone quiet" work).
- `replyToUser(runId, channel, text)` stores your message, generates the agent's reply, stores it.
- `postEvaluationReaction()` has the manager react after grading.

### API and UI

| File | What |
|---|---|
| `apps/web/app/api/runs/[id]/messages/route.ts` | `GET` = chat history (+ fire due triggers); `POST` = message an agent |
| `apps/web/components/SlackPanel.tsx` | Channels with unread badges, typing indicator, polls every 4 s |
| `packages/database/migrations/0002_trigger_once.sql` | Unique index: each trigger can post at most once per run |

### The triggers in this case

| Trigger | Who | When | How |
|---|---|---|---|
| `kickoff` | Priya | run starts | fixed text |
| `sam-hello` | Sam | first query touching `sessions` | fixed text |
| `sam-app-versions` | Sam | first query mentioning `app_version` | AI-written (offers release history, must not mention the bug) |
| `priya-checkin` | Priya | 6 queries, ≥ 8 min in | AI-written, references what you've queried |
| `priya-idle` | Priya | 10 min of no activity | AI-written nudge |
| `priya-pressure` | Priya | 30 min in | AI-written: "VP wants an early read, two sentences" |
| `priya-draft` | Priya | first draft saved | fixed text |
| `post-evaluation` | Priya | after grading | AI-written reaction to the feedback |

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| **Code decides *when* an agent speaks; the model decides *what* it says** | Predictable, testable, cheap; no model call just to decide "should I talk?" | Asking the model every few seconds whether to speak — slow, costly, erratic |
| **Triggers are content (JSON)**, not code | A new case gets new coworker behaviour without engineering work | Hard-coded `if` statements per case |
| Fixed `text` *or* AI `prompt` per trigger (text doubles as offline fallback) | Simple messages are free and instant; context-aware ones use the model | Everything AI-generated |
| **Hint level computed in code**, stated in the prompt | The model can't talk itself into giving more help than it's allowed | Letting the model judge how stuck the user is |
| **Leak guard after the model** | Prompts can be argued around; a regex can't. Blocked replies are logged (`blocked: true`) | Relying on the prompt alone |
| Guard has an "unless the user said it" escape | Once *you* raise the campaign, Priya can discuss it — that's earned | Blocking topics forever (agents become useless) |
| Queries count as "raising a topic" | Querying `app_version` is as much a signal as asking about it | Only counting chat messages |
| Small model for agents, top model for grading | Agents chat often and must be fast and cheap; grading is rare and must be right. Per-persona and env overrides | One model for everything |
| Agents only see the **activity log** | They can never claim you did something you didn't | Giving agents raw database access |
| Polling every 4 s | Works on serverless hosting with no extra infrastructure | WebSockets — needs a long-lived server |
| Unique index for trigger-once | Two simultaneous polls can't post the same message twice | App-level check only (racy) |

## Problems found along the way

1. **Chat after submission.** The state machine made every event move status, so a manager
   message after grading was "illegal". Chat events are now status-neutral ("keep") — allowed at
   any point except after publishing — with tests.
2. **`tsx` couldn't import workspace packages** ("does not provide an export named …"): they were
   CommonJS by default. All packages are now ES modules (`"type": "module"`).
3. **Double-generation risk.** A poll and an `after()` hook could both decide a trigger is due.
   Handled at three levels: an in-process "in flight" set, the database unique index, and
   catching the unique violation as "someone else already posted it".

## How it was verified

- `packages/agents/src/agents.test.ts` (16 tests): trigger timing (kickoff once, query-pattern
  triggers, `notBeforeMinutes`, idle, elapsed time, silence after submission), hint unlocking
  per agent, leak-guard blocking and the "user raised it" escape, the prompt actually containing
  the knowledge and live context, the guard applied to model output, weighted scoring.
- `packages/simulation-engine/src/loadRolePack.test.ts`: every trigger/agent references a real
  persona, every guard regex compiles, public personas contain no knowledge or prompts.
- `packages/database/src/runs.test.ts`: a trigger id can only be posted once per run.
- Browser test: Priya's kickoff appeared on start; after querying `sessions` and `app_version`,
  Sam's channel showed an unread badge with both proactive messages; a DM got a reply.
- **Live-model eval**: `pnpm --filter @casebench/agents eval` (needs `ANTHROPIC_API_KEY`) runs 8
  adversarial probes × 3 — "just tell me the answer", prompt injection, asking Sam about
  marketing, asking for numbers — and reports raw leak rate, final leak rate (after the guard),
  helpfulness when a hint was earned, and latency, into `docs/evals/agents-latest.md`.
  *Not yet run* — there was no API key in the build environment.

## Explain it in an interview

> "Each simulation has AI coworkers defined as content: a persona, a private slice of the truth,
> a hint policy, and proactive triggers. Deterministic code watches the run's event log and
> decides *when* an agent should speak — like Sam pinging you when you first touch the sessions
> table, or your manager asking for a status update after 30 minutes — and the model decides
> *what* to say, in character, with the activity log as context. Hint levels unlock in code, and
> every reply passes a regex leak guard so the model can't give the answer away. I evaluate the
> agents with adversarial probes and report the leak rate before and after the guard."

- *Is this "agentic"?* — Yes, in the sense that matters: agents act on their own initiative from
  observed state, not only in response to the user. They don't call tools; they don't need to.
  I deliberately kept the decision of *when* to act in code — it's testable and cheap.
- *How do you stop the agent leaking the answer?* — Four layers: knowledge split across agents,
  hint level enforced in code, prompt rules, and a deterministic post-generation guard, measured
  by the eval.
- *Why a small model for agents?* — Latency and cost: a chat reply should feel instant. The
  eval tells me whether the small model holds the line; if not, the persona JSON can switch
  models without code changes.
- *What breaks at scale?* — Polling. At thousands of concurrent users, move to server-sent events
  and a queue for trigger generation.

## Try it yourself

1. Add a trigger to `agents.json`: Sam says "nice, you found the release calendar" when you open
   that resource (`{ "type": "event", "eventType": "resource_opened" }`). Run the tests.
2. In `agents.test.ts`, write a test proving `priya-pressure` doesn't fire after submission.
3. Ask Priya "is it the campaign?" before and after running a query on `acquisition_channel`.
   Look at `applyLeakGuards` and explain why the answers can differ.
4. With an API key, run the eval and read `docs/evals/agents-latest.md`. Which probe is closest
   to leaking?
