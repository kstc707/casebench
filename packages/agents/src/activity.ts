import type { RunEvent } from "@casebench/domain";

/**
 * Turns the raw event log into things an agent can reason about: how long
 * the user has been working, what they've queried, what was said. This is
 * the agents' "eyes" — they only know what the event log shows, so they can
 * never claim the user did something they didn't.
 */

export function startedAt(events: RunEvent[]): number {
  const start = events.find((e) => e.type === "run_started");
  return start ? Date.parse(start.at) : Date.now();
}

export function minutesElapsed(events: RunEvent[], now: number): number {
  return (now - startedAt(events)) / 60_000;
}

/** Minutes since the user last did anything (query, message, resource, draft). */
export function minutesIdle(events: RunEvent[], now: number): number {
  const userEvents = events.filter((e) => e.type !== "message_received");
  const last = userEvents.length ? Date.parse(userEvents[userEvents.length - 1].at) : startedAt(events);
  return (now - last) / 60_000;
}

export function queries(events: RunEvent[]) {
  return events.flatMap((e) => (e.type === "query_run" ? [e] : []));
}

export function userMessages(events: RunEvent[], channel?: string): string[] {
  return events.flatMap((e) =>
    e.type === "message_sent" && (!channel || e.channel === channel) ? [e.text] : []
  );
}

export function firedTriggerIds(events: RunEvent[]): Set<string> {
  return new Set(
    events.flatMap((e) => (e.type === "message_received" && e.trigger ? [e.trigger] : []))
  );
}

/** Table names a query reads from (FROM / JOIN), so agents know what you've looked at. */
export function tablesIn(sql: string): string[] {
  const names = [...sql.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_]*)/gi)].map((m) => m[1].toLowerCase());
  return names.filter((n) => !["select", "lateral", "unnest"].includes(n));
}

/** A compact, factual description of the user's work so far, for the agent's context. */
export function summarizeActivity(events: RunEvent[], now: number): string {
  const qs = queries(events);
  const touched = [...new Set(qs.flatMap((q) => tablesIn(q.sql)))];
  const resources = [
    ...new Set(events.flatMap((e) => (e.type === "resource_opened" ? [e.resourceTitle] : []))),
  ];
  const drafted = events.some((e) => e.type === "submission_drafted");
  const submitted = events.some((e) => e.type === "submission_finalized");

  const lines = [
    `Time since they started: ${Math.round(minutesElapsed(events, now))} minutes.`,
    `Queries run: ${qs.length} (${qs.filter((q) => q.error).length} errored).`,
    `Tables queried: ${touched.length ? touched.join(", ") : "none yet"}.`,
    `Resources opened: ${resources.length ? resources.join("; ") : "none"}.`,
    `Write-up: ${submitted ? "submitted" : drafted ? "drafting" : "not started"}.`,
  ];
  const recent = qs.slice(-5);
  if (recent.length) {
    lines.push("Most recent queries (oldest first):");
    for (const q of recent) {
      const outcome = q.error ? `error: ${q.error.slice(0, 120)}` : `${q.rowCount ?? "?"} rows`;
      lines.push(`- ${q.sql.replace(/\s+/g, " ").slice(0, 300)}  → ${outcome}`);
    }
  }
  return lines.join("\n");
}

/** The Slack DM between the user and one agent, as plain text. */
export function transcript(events: RunEvent[], channel: string, agentName: string): string {
  const lines = events.flatMap((e) => {
    if (e.type === "message_sent" && e.channel === channel) return [`You (new teammate): ${e.text}`];
    if (e.type === "message_received" && e.channel === channel) return [`${agentName}: ${e.text}`];
    return [];
  });
  return lines.length ? lines.slice(-20).join("\n") : "(no messages yet)";
}
