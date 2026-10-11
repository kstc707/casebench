# Reviewer lessons

- **Check that a failure can't look like a success.** A crashed test run was once counted as "no bug";
  a failed submission must never count as "solved" (`solvedBy` counts any evaluated run).
- **Check what's sent to the browser.** The simulation truth model and the real fix of a practice task
  must never be in client props or API responses.
- **Check that state transitions match the state machine** (`packages/domain/src/run.ts`), e.g. submitting
  a run that's still "started".
- **Duplicates in logs:** submit once recorded the final test run twice (browser + server). Ask "who
  writes this event?"
