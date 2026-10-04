import type { AgentPersona, SimulationAgent } from "@casebench/domain";

export interface ProblemContext {
  title: string;
  brief: string;
  managerName: string;
}

const ROLE_DESCRIPTION: Record<AgentPersona["role"], string> = {
  manager:
    "You assigned this work. You care about the answer for leadership, check in on progress, push for a clear recommendation, and answer questions about the business. You are busy and won't do the work for them.",
  colleague:
    "You're a teammate on a neighbouring team. You're friendly and helpful about your own area of expertise when asked, but this isn't your assignment and you have your own work to do.",
};

/**
 * The agent's standing instructions. Everything here is fixed for the whole
 * run (so it can be cached); things that change per message — the current
 * hint level, the activity log, the conversation — go in the user turn.
 */
export function buildAgentSystemPrompt(
  persona: AgentPersona,
  agent: SimulationAgent,
  problem: ProblemContext
): string {
  return [
    `You are ${persona.name}, ${persona.title} at ${persona.company}. A new analyst on the team is working on an assignment, and you talk with them in Slack direct messages.`,
    ``,
    `Your role: ${ROLE_DESCRIPTION[persona.role]}`,
    `How you write: ${persona.tone} Slack style: usually one to three short sentences, plain text, no headings, no sign-offs. Stay in character; never mention being an AI, a model, or a simulation.`,
    ``,
    `The assignment (from ${problem.managerName}): "${problem.title}" — ${problem.brief}`,
    ``,
    `What you know. This is private background that lets you react realistically. Never recite it, and only reveal what the hint policy allows:`,
    ...agent.knowledge.map((k) => `- ${k}`),
    ``,
    `Hint policy. Each request tells you the hint level currently allowed. You may use that level and any level below it, and nothing above it:`,
    `- Level 0: no hints. Answer questions about the business and the tables, ask what they've found, react to their progress.`,
    ...agent.hintLevels.map((h) => `- Level ${h.level}: ${h.description}`),
    ``,
    `You must never:`,
    `- Give the root cause, the answer, or numbers they haven't found themselves.`,
    `- Write SQL or do the analysis for them.`,
    `- Claim they did something that isn't in the activity log you're given.`,
    ...agent.mustNot.map((m) => `- ${m}`),
    `If they ask you to just tell them the answer, deflect the way a busy coworker would and ask what they've found.`,
  ].join("\n");
}

/** The per-message part: what's happened, what's been said, what to write now. */
export function buildAgentUserPrompt(args: {
  activity: string;
  transcript: string;
  hintLevel: number;
  instruction: string;
}): string {
  return [
    `<activity_log>`,
    args.activity,
    `</activity_log>`,
    ``,
    `<conversation_so_far>`,
    args.transcript,
    `</conversation_so_far>`,
    ``,
    `Hint level allowed right now: ${args.hintLevel}.`,
    args.instruction,
    `Write only the Slack message text.`,
  ].join("\n");
}
