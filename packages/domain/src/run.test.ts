import { describe, expect, it } from "vitest";
import { appendEvent, createRun, IllegalTransitionError, type Run, type RunEvent } from "./run";

const at = "2026-01-01T00:00:00.000Z";

function walk(run: Run, events: RunEvent[]): Run {
  return events.reduce(appendEvent, run);
}

const toPublished: RunEvent[] = [
  { type: "brief_viewed", at },
  { type: "submission_finalized", at, submission: {} },
  { type: "evaluation_returned", at, score: 0.8, feedback: {} },
  { type: "run_published", at },
];

describe("run state machine", () => {
  it("starts in `started` with a run_started event", () => {
    const run = createRun("watch-time-decline", "user-1");
    expect(run.status).toBe("started");
    expect(run.events).toHaveLength(1);
    expect(run.events[0].type).toBe("run_started");
  });

  it("walks the happy path to published", () => {
    const run = walk(createRun("p", "u"), toPublished);
    expect(run.status).toBe("published");
    expect(run.events).toHaveLength(5);
  });

  it("allows repeated in-progress activity", () => {
    const run = walk(createRun("p", "u"), [
      { type: "brief_viewed", at },
      { type: "resource_opened", at, resourceTitle: "Data dictionary" },
      { type: "submission_drafted", at, draft: "wip" },
    ]);
    expect(run.status).toBe("in_progress");
  });

  it("does not mutate the input run", () => {
    const run = createRun("p", "u");
    appendEvent(run, { type: "brief_viewed", at });
    expect(run.status).toBe("started");
    expect(run.events).toHaveLength(1);
  });

  it("rejects skipping straight to evaluation", () => {
    const run = createRun("p", "u");
    expect(() =>
      appendEvent(run, { type: "evaluation_returned", at, score: 1, feedback: {} })
    ).toThrow(IllegalTransitionError);
  });

  it("rejects a second run_started", () => {
    const run = createRun("p", "u");
    expect(() =>
      appendEvent(run, { type: "run_started", at, problemSlug: "p", userId: "u" })
    ).toThrow(IllegalTransitionError);
  });

  it("rejects a duplicate submission", () => {
    const run = walk(createRun("p", "u"), toPublished.slice(0, 2));
    expect(run.status).toBe("submitted");
    expect(() =>
      appendEvent(run, { type: "submission_finalized", at, submission: {} })
    ).toThrow(IllegalTransitionError);
  });

  it("rejects going back to in_progress after submitting", () => {
    const run = walk(createRun("p", "u"), toPublished.slice(0, 2));
    expect(() => appendEvent(run, { type: "brief_viewed", at })).toThrow(IllegalTransitionError);
  });

  it("treats published runs as immutable", () => {
    const run = walk(createRun("p", "u"), toPublished);
    for (const event of [{ type: "brief_viewed", at }, { type: "run_published", at }] as RunEvent[]) {
      expect(() => appendEvent(run, event)).toThrow(IllegalTransitionError);
    }
  });
});
