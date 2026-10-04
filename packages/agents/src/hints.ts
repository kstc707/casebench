import type { RunEvent, SimulationAgent } from "@casebench/domain";
import { minutesElapsed, userMessages } from "./activity";

/**
 * Hints unlock gradually, like a real manager who gets more direct the longer
 * you've been stuck. Level 0 = no hints yet. The level is computed here, in
 * code, and stated in the prompt — the model doesn't decide how much to give.
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
  return level;
}
