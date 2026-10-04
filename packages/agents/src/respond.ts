import type { AgentPersona, LeakGuard, RunEvent, SimulationAgent } from "@casebench/domain";
import { agentModel, type AIProvider } from "@casebench/ai";
import { queries, summarizeActivity, transcript, userMessages } from "./activity";
import { applyLeakGuards } from "./guard";
import { currentHintLevel } from "./hints";
import { buildAgentSystemPrompt, buildAgentUserPrompt, type ProblemContext } from "./prompt";

export interface AgentTurnInput {
  provider: AIProvider;
  persona: AgentPersona;
  agent: SimulationAgent;
  problem: ProblemContext;
  guards: LeakGuard[];
  events: RunEvent[];
  now: number;
  /** What to do: reply to the latest message, or a trigger's instruction. */
  instruction: string;
  /** Canned text the offline mock returns (keeps the demo coherent without a key). */
  mock: string;
}

/**
 * One agent "turn": build context from the event log, ask the model for a
 * Slack message, then run it through the leak guard. Returns the text to post
 * and whether the guard had to replace it.
 */
export async function generateAgentMessage(input: AgentTurnInput): Promise<{ text: string; blocked: boolean }> {
  const { persona, agent, events, now } = input;
  const raw = await input.provider.complete({
    model: agentModel(persona.model),
    maxTokens: 400,
    system: buildAgentSystemPrompt(persona, agent, input.problem),
    user: buildAgentUserPrompt({
      activity: summarizeActivity(events, now),
      transcript: transcript(events, persona.id, persona.name),
      hintLevel: currentHintLevel(agent, events, now),
      instruction: input.instruction,
    }),
    mock: input.mock,
  });

  // "Raised by the user" = anything they wrote in any channel, or queried.
  const userTexts = [...userMessages(events), ...queries(events).map((q) => q.sql)];
  return applyLeakGuards(raw || input.mock, input.guards, persona.id, userTexts);
}

export function replyInstruction(userText: string): string {
  return `They just sent you this message: """${userText}""" Reply to it.`;
}
