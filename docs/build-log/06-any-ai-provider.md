# 06 — Run on free AI providers, and one-click deploys

## Goal

Make the project runnable without a paid Claude API account (a Claude chat subscription doesn't
include API access), and make deploying possible from a browser with nothing installed locally.

## What we built

| File | What |
|---|---|
| `packages/ai/src/openaiCompatibleProvider.ts` | One adapter for every service that speaks the OpenAI "chat completions" format: Gemini, Groq, OpenRouter, Ollama, … |
| `packages/ai/src/config.ts` | Provider presets (URL, key variable, default models) and auto-detection from whichever key is set |
| `packages/ai/src/providers.test.ts` | Tests against a fake API server: request shape, auth header, JSON validation, retry, provider selection |
| `apps/web/package.json` → `vercel-build` | Runs database migrations, then builds, on every Vercel deploy |
| `docs/deploy.md` | Rewritten as a browser-only, step-by-step guide with a provider comparison |

### Structured output without vendor support

Claude has strict structured outputs; most free providers only promise "a JSON object". So the
adapter:

1. puts the JSON Schema (generated from the same Zod schema) in the system prompt;
2. asks for `response_format: json_object`;
3. validates the reply with Zod (also accepting JSON wrapped in a code fence or chatty text);
4. if it doesn't validate, sends the error back and retries **once**;
5. then fails loudly — grading never silently accepts a malformed result.

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| One OpenAI-compatible adapter | Covers many providers with ~100 lines; free tiers live there | A separate SDK per vendor |
| Plain `fetch`, no SDK | The request is one JSON POST; no extra dependency | The `openai` npm package |
| Auto-detect from env keys | Switching provider = change one variable, no code | A config file to edit |
| Gemini as the recommended free default | Generous free daily limits and a high tokens-per-minute cap, which matters because each agent call carries ~2k tokens of context | Groq — fast, but a 6k tokens/minute cap throttles bursts |
| Migrations inside `vercel-build` | No local tools needed; the schema is always current on deploy | Running `pnpm db:migrate` by hand from a laptop |
| The provider interface didn't change | The agent engine and grader worked unchanged; this is the payoff of the abstraction from step 04 | — |

## Honest caveats

- Not run against the live Gemini/Groq/OpenRouter APIs from the build environment (outbound
  access is blocked there). Tested with a fake server that mimics the format. Do one real run
  after deploying.
- Free open models are weaker than Claude at staying in character and following "don't reveal"
  rules. That's exactly what the leak guard and the agent eval are for. Run the eval on whichever
  provider you deploy with.
- Model names in the presets change over time. Override with `CASEBENCH_AGENT_MODEL` /
  `CASEBENCH_EVALUATOR_MODEL` if a provider retires one.

## Explain it in an interview

> "The AI layer is behind a provider interface. Claude uses the official SDK with strict
> structured outputs; everything else goes through one OpenAI-compatible adapter, where I get
> structured output by putting the JSON Schema in the prompt, validating with Zod, and retrying
> once with the validation error. The provider is picked from environment variables, so the same
> deploy can run on a free Gemini key for demos or Claude for quality."

## Try it yourself

1. Read `providers.test.ts`, then make the fake server return invalid JSON twice. Which error
   does the grader raise, and where would the user see it?
2. Add a preset for another OpenAI-compatible provider in `PRESETS` and a test for its detection.
