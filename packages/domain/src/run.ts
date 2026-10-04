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
  | { type: "manager_message_sent"; at: string; message: string }
  | { type: "manager_message_received"; at: string; message: string; hintLevel: number }
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

export function statusForEvent(event: RunEvent): RunStatus | null {
  switch (event.type) {
    case "run_started":
      return "started";
    case "brief_viewed":
    case "resource_opened":
    case "manager_message_sent":
    case "manager_message_received":
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
  const nextStatus = statusForEvent(event);
  if (nextStatus === null) {
    throw new Error(`Unknown event type: ${(event as { type: string }).type}`);
  }

  const allowed = ALLOWED_TRANSITIONS[run.status];
  // Same-status events are only legal where ALLOWED_TRANSITIONS says so
  // (in_progress -> in_progress). Without this, e.g. a second run_started
  // or a duplicate submission_finalized would slip through.
  if (!allowed.includes(nextStatus)) {
    throw new IllegalTransitionError(run.status, nextStatus);
  }

  if (run.status === "published") {
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
