/**
 * A Run is modeled as an append-only event log, not a mutable row.
 * See docs/architecture.md § "Core model: event-log state machine".
 *
 * Why: replayability (you can reconstruct the whole attempt from its events),
 * auditability (nothing about what happened is overwritten), and safe
 * extension (a new event type doesn't require migrating existing rows).
 */

export type RunStatus =
  | "started"
  | "in_progress"
  | "submitted"
  | "evaluated"
  | "published";

export type RunEvent =
  | { type: "run_started"; at: string; problemSlug: string; userId: string }
  | { type: "brief_viewed"; at: string }
  | { type: "resource_opened"; at: string; resourceTitle: string }
  /** A SQL query the user ran in the sandbox — this is how agents "watch" the work. */
  | { type: "query_run"; at: string; sql: string; rowCount: number | null; error: string | null }
  /** The user posted in a Slack channel (channel = the agent persona's id). */
  | { type: "message_sent"; at: string; channel: string; text: string }
  /**
   * An agent posted in a channel. `trigger` is the id of the proactive trigger
   * that caused it, or null when it's a reply to the user. `blocked` is true
   * when the leak guard replaced the model's original reply.
   */
  | {
      type: "message_received";
      at: string;
      channel: string;
      text: string;
      trigger: string | null;
      blocked?: boolean;
    }
  /** The user pressed "I'm stuck": the coworker on `channel` gives one stronger hint. */
  | { type: "hint_requested"; at: string; channel: string }
  | { type: "submission_drafted"; at: string; draft: unknown }
  | { type: "submission_finalized"; at: string; submission: unknown }
  | { type: "evaluation_returned"; at: string; score: number; feedback: unknown }
  | { type: "run_published"; at: string };

export interface Run {
  id: string;
  problemSlug: string;
  userId: string;
  status: RunStatus;
  events: RunEvent[];
}

/**
 * The only legal status transitions. Anything not listed here is rejected —
 * in particular, a `published` run can never transition again (it's
 * immutable), which matters for the portfolio feature: a shared result
 * should reflect a frozen run, not one someone kept editing after seeing
 * their grade. The Postgres schema enforces this too (see
 * packages/database/migrations/0001_init.sql), this is the in-app mirror of that rule.
 */
const ALLOWED_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  started: ["in_progress"],
  in_progress: ["in_progress", "submitted"],
  submitted: ["evaluated"],
  evaluated: ["published"],
  published: [], // terminal — no further transitions
};

/**
 * What an event does to the run's status: move it to a status, or "keep" it.
 * Chat messages are "keep" events: conversation can happen at any point
 * (before starting, after submitting, while waiting for a grade) without
 * changing where the run is — except after publishing, when nothing can be
 * appended at all.
 */
export function statusForEvent(event: RunEvent): RunStatus | "keep" | null {
  switch (event.type) {
    case "run_started":
      return "started";
    case "message_sent":
    case "message_received":
    case "hint_requested":
      return "keep";
    case "brief_viewed":
    case "resource_opened":
    case "query_run":
    case "submission_drafted":
      return "in_progress";
    case "submission_finalized":
      return "submitted";
    case "evaluation_returned":
      return "evaluated";
    case "run_published":
      return "published";
    default:
      return null;
  }
}

export class IllegalTransitionError extends Error {
  constructor(from: RunStatus, to: RunStatus) {
    super(`Illegal run transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

/**
 * Append an event to a run, enforcing the state machine. Pure function —
 * returns a new Run rather than mutating, so callers (API routes, tests)
 * can reason about it without side effects.
 */
export function appendEvent(run: Run, event: RunEvent): Run {
  const effect = statusForEvent(event);
  if (effect === null) {
    throw new Error(`Unknown event type: ${(event as { type: string }).type}`);
  }
  if (run.status === "published") {
    throw new IllegalTransitionError(run.status, effect === "keep" ? run.status : effect);
  }
  if (effect === "keep") {
    return { ...run, events: [...run.events, event] };
  }
  const nextStatus = effect;

  const allowed = ALLOWED_TRANSITIONS[run.status];
  // Same-status events are only legal where ALLOWED_TRANSITIONS says so
  // (in_progress -> in_progress). Without this, e.g. a second run_started
  // or a duplicate submission_finalized would slip through.
  if (!allowed.includes(nextStatus)) {
    throw new IllegalTransitionError(run.status, nextStatus);
  }

  return {
    ...run,
    status: nextStatus,
    events: [...run.events, event],
  };
}

export function createRun(problemSlug: string, userId: string): Run {
  const startEvent: RunEvent = {
    type: "run_started",
    at: new Date().toISOString(),
    problemSlug,
    userId,
  };
  return {
    id: crypto.randomUUID(),
    problemSlug,
    userId,
    status: "started",
    events: [startEvent],
  };
}
