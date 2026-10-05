import type { AgentTrigger, RunEvent } from "@casebench/domain";
import { firedTriggerIds, minutesElapsed, minutesIdle, queries } from "./activity";

/**
 * Which proactive messages are due right now? Pure function of the event log
 * and the clock — no AI involved — so it's cheap, predictable, and unit
 * tested. Each trigger fires at most once per run (the database enforces
 * that too, with a unique index).
 */
export function dueTriggers(triggers: AgentTrigger[], events: RunEvent[], now: number): AgentTrigger[] {
  const fired = firedTriggerIds(events);
  const submitted = events.some((e) => e.type === "submission_finalized");
  const elapsed = minutesElapsed(events, now);

  return triggers.filter((t) => {
    if (fired.has(t.id)) return false;
    if (t.notBeforeMinutes !== undefined && elapsed < t.notBeforeMinutes) return false;
    const w = t.when;
    switch (w.type) {
      case "run_started":
        return events.some((e) => e.type === "run_started");
      case "event":
        return events.some((e) => e.type === w.eventType);
      case "query_count":
        return !submitted && queries(events).length >= w.atLeast;
      case "query_matches": {
        const re = new RegExp(w.pattern, "i");
        return !submitted && queries(events).filter((q) => re.test(q.sql)).length >= w.atLeast;
      }
      case "minutes_elapsed":
        return !submitted && elapsed >= w.atLeast;
      case "idle":
        return !submitted && minutesIdle(events, now) >= w.minutes;
    }
  });
}
