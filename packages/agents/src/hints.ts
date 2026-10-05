import type { RunEvent, SimulationAgent } from "@casebench/domain";
import { minutesElapsed, userMessages } from "./activity";

/**
 * Hints unlock gradually, like a real manager who gets more direct the longer
 * you've been stuck. Level 0 = no hints yet. The level is computed here, in
 * code, and stated in the prompt — the model doesn't decide how much to give.
 *
 * Two ways up: time spent / questions asked (automatic), and pressing
 * "I'm stuck" (each request raises the level by one, up to the agent's max).
 */
export function currentHintLevel(agent: SimulationAgent, events: RunEvent[], now: number): number {
  const minutes = minutesElapsed(events, now);
  const asked = userMessages(events, agent.personaId).length;
  let level = 0;
  for (const h of agent.hintLevels) {
    const byTime = h.unlockAfterMinutes !== undefined && minutes >= h.unlockAfterMinutes;
    const byQuestions = h.unlockAfterUserMessages !== undefined && asked >= h.unlockAfterUserMessages;
    const always = h.unlockAfterMinutes === undefined && h.unlockAfterUserMessages === undefined;
    if (always || byTime || byQuestions) level = Math.max(level, h.level);
  }
  const maxLevel = Math.max(0, ...agent.hintLevels.map((h) => h.level));
  return Math.min(maxLevel, level + hintsRequested(events, agent.personaId));
}

export function hintsRequested(events: RunEvent[], channel?: string): number {
  return events.filter((e) => e.type === "hint_requested" && (!channel || e.channel === channel)).length;
}
