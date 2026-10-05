import "server-only";
import { IllegalTransitionError, type RunEvent } from "@casebench/domain";
import { getAIProvider } from "@casebench/ai";
import { dueTriggers, generateAgentMessage, replyInstruction, type ProblemContext } from "@casebench/agents";
import type { ProblemBundle } from "@casebench/simulation-engine";
import { appendRunEvent, getPool, getRun, isUniqueViolation } from "./db";
import { getBundle } from "./problems";

/**
 * The orchestrator: the glue between the agent engine (pure logic in
 * packages/agents), the AI provider, and the database. Two entry points:
 *
 *  - fireDueTriggers: called after the user does something (and on every
 *    poll). Agents decide whether to speak up, based on the event log.
 *  - replyToUser: the user messaged an agent; the agent answers.
 */

/** Stops the same server process from generating one trigger twice at once. */
const inFlight = new Set<string>();

function problemContext(bundle: ProblemBundle): ProblemContext {
  const p = bundle.problem;
  const manager = bundle.personas.find((x) => x.role === "manager");
  return {
    title: p.title,
    brief: p.type === "case-study" ? p.brief : p.assignmentBrief,
    managerName: manager?.name ?? "your manager",
  };
}

function agentFor(bundle: ProblemBundle, personaId: string) {
  const persona = bundle.personas.find((p) => p.id === personaId);
  const agent = bundle.agents.agents.find((a) => a.personaId === personaId);
  return persona && agent ? { persona, agent } : null;
}

export async function fireDueTriggers(runId: string, userId: string): Promise<void> {
  const pool = getPool();
  const run = await getRun(pool, runId, userId);
  if (run.status === "published") return;
  const bundle = await getBundle(run.problemSlug);
  if (!bundle) return;

  const provider = getAIProvider();
  for (const trigger of dueTriggers(bundle.agents.triggers, run.events, Date.now())) {
    const key = `${runId}:${trigger.id}`;
    if (inFlight.has(key)) continue;
    inFlight.add(key);
    try {
      let text = trigger.text ?? "";
      let blocked = false;
      const who = agentFor(bundle, trigger.personaId);
      if (trigger.prompt && who) {
        try {
          ({ text, blocked } = await generateAgentMessage({
            provider,
            ...who,
            problem: problemContext(bundle),
            guards: bundle.agents.leakGuards,
            events: run.events,
            now: Date.now(),
            instruction: trigger.prompt,
            mock: trigger.text ?? who.persona.offlineReply,
          }));
        } catch (err) {
          // AI unavailable: fall back to the fixed text if there is one.
          console.error(`trigger ${trigger.id} generation failed`, err);
          if (!trigger.text) continue;
        }
      }
      if (!text) continue;
      await appendRunEvent(pool, runId, userId, {
        type: "message_received",
        at: new Date().toISOString(),
        channel: trigger.personaId,
        text,
        trigger: trigger.id,
        blocked,
      });
    } catch (err) {
      // Lost a race to another request (unique index) or the run moved on: fine.
      if (!isUniqueViolation(err) && !(err instanceof IllegalTransitionError)) throw err;
    } finally {
      inFlight.delete(key);
    }
  }
}

export class UnknownChannelError extends Error {}

export async function replyToUser(runId: string, userId: string, channel: string, text: string) {
  const pool = getPool();
  const run = await getRun(pool, runId, userId);
  const bundle = await getBundle(run.problemSlug);
  const who = bundle && agentFor(bundle, channel);
  if (!bundle || !who) throw new UnknownChannelError(channel);

  const sent: RunEvent = { type: "message_sent", at: new Date().toISOString(), channel, text };
  await appendRunEvent(pool, runId, userId, sent);

  const reply = await generateAgentMessage({
    provider: getAIProvider(),
    ...who,
    problem: problemContext(bundle),
    guards: bundle.agents.leakGuards,
    events: [...run.events, sent],
    now: Date.now(),
    instruction: replyInstruction(text),
    mock: who.persona.offlineReply,
  });
  await appendRunEvent(pool, runId, userId, {
    type: "message_received",
    at: new Date().toISOString(),
    channel,
    text: reply.text,
    trigger: null,
    blocked: reply.blocked,
  });
}

/** The manager's reaction once the write-up has been graded. */
export async function postEvaluationReaction(
  runId: string,
  userId: string,
  bundle: ProblemBundle,
  events: RunEvent[],
  evaluation: { score: number; strengths: string[]; improvements: string[] }
) {
  const manager = bundle.personas.find((p) => p.role === "manager");
  const who = manager && agentFor(bundle, manager.id);
  if (!who) return;
  const fallback = "Thanks for sending this over — really helpful for Thursday. I left notes in the feedback panel 🙏";
  let message = { text: fallback, blocked: false };
  try {
    message = await generateAgentMessage({
      provider: getAIProvider(),
      ...who,
      problem: problemContext(bundle),
      guards: [],
      events,
      now: Date.now(),
      instruction: [
        `They just sent you their final write-up and you've read it. Reviewer notes — what went well: ${evaluation.strengths.join("; ")}. What to tighten: ${evaluation.improvements.join("; ")}.`,
        `React as their manager in two or three sentences: thank them, name one specific thing they did well and one thing to tighten next time. Don't mention a score.`,
      ].join(" "),
      mock: fallback,
    });
  } catch (err) {
    console.error("evaluation reaction failed", err);
  }
  try {
    await appendRunEvent(getPool(), runId, userId, {
      type: "message_received",
      at: new Date().toISOString(),
      channel: who.persona.id,
      text: message.text,
      trigger: "post-evaluation",
      blocked: message.blocked,
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
}
