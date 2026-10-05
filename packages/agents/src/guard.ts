import type { LeakGuard } from "@casebench/domain";

/**
 * The deterministic backstop behind the prompt. Prompts can be talked
 * around; a regex can't. If an agent's reply reveals something the user
 * hasn't raised themselves, the reply is swapped for a safe deflection and
 * flagged (blocked: true) so it shows up in the event log and in evals.
 */
export function applyLeakGuards(
  text: string,
  guards: LeakGuard[],
  personaId: string,
  userTexts: string[]
): { text: string; blocked: boolean } {
  const said = userTexts.join("\n");
  for (const g of guards) {
    if (g.personaId !== personaId && g.personaId !== "*") continue;
    if (!new RegExp(g.pattern, "i").test(text)) continue;
    if (g.unlessUserSaid && new RegExp(g.unlessUserSaid, "i").test(said)) continue;
    return { text: g.replacement, blocked: true };
  }
  return { text, blocked: false };
}
