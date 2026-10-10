import type { RunEvent } from "@casebench/domain";

/**
 * The only event types a browser may append directly. Everything else is
 * produced server-side by its own route: chat messages by the messages route
 * (so agent replies are real), submission/evaluation by the submit route and
 * publishing by the publish route (so a client can't post its own score).
 */
export const CLIENT_EVENT_TYPES = [
  "brief_viewed",
  "resource_opened",
  "query_run",
  "tests_run",
  "submission_drafted",
] as const;

const MAX_DRAFT_BYTES = 50_000;
const MAX_TITLE_LENGTH = 200;
const MAX_SQL_LENGTH = 5_000;
const MAX_ERROR_LENGTH = 500;
const MAX_FAILING_LISTED = 20;
const MAX_TEST_ID_LENGTH = 300;

/**
 * Validates an untrusted request body and builds the event. The timestamp
 * is always set here, never taken from the client.
 */
export function parseClientEvent(
  body: unknown
): { ok: true; event: RunEvent } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const at = new Date().toISOString();

  switch (b.type) {
    case "brief_viewed":
      return { ok: true, event: { type: "brief_viewed", at } };

    case "resource_opened":
      if (typeof b.resourceTitle !== "string" || b.resourceTitle.length === 0) {
        return { ok: false, error: "resourceTitle must be a non-empty string" };
      }
      if (b.resourceTitle.length > MAX_TITLE_LENGTH) {
        return { ok: false, error: `resourceTitle must be at most ${MAX_TITLE_LENGTH} characters` };
      }
      return { ok: true, event: { type: "resource_opened", at, resourceTitle: b.resourceTitle } };

    case "query_run": {
      if (typeof b.sql !== "string" || b.sql.trim().length === 0) {
        return { ok: false, error: "sql must be a non-empty string" };
      }
      const rowCount = b.rowCount ?? null;
      if (rowCount !== null && (!Number.isInteger(rowCount) || (rowCount as number) < 0)) {
        return { ok: false, error: "rowCount must be a non-negative integer or null" };
      }
      const error = b.error ?? null;
      if (error !== null && typeof error !== "string") {
        return { ok: false, error: "error must be a string or null" };
      }
      return {
        ok: true,
        event: {
          type: "query_run",
          at,
          // Truncate rather than reject: a huge pasted query is still worth logging.
          sql: b.sql.slice(0, MAX_SQL_LENGTH),
          rowCount: rowCount as number | null,
          error: error === null ? null : error.slice(0, MAX_ERROR_LENGTH),
        },
      };
    }

    case "tests_run": {
      const { passed, total } = b;
      if (!Number.isInteger(passed) || !Number.isInteger(total) || (passed as number) < 0 || (passed as number) > (total as number)) {
        return { ok: false, error: "passed and total must be integers with 0 <= passed <= total" };
      }
      if (!Array.isArray(b.failing) || !b.failing.every((t) => typeof t === "string")) {
        return { ok: false, error: "failing must be an array of test ids" };
      }
      const error = b.error ?? null;
      if (error !== null && typeof error !== "string") return { ok: false, error: "error must be a string or null" };
      return {
        ok: true,
        event: {
          type: "tests_run",
          at,
          passed: passed as number,
          total: total as number,
          failing: (b.failing as string[]).slice(0, MAX_FAILING_LISTED).map((t) => t.slice(0, MAX_TEST_ID_LENGTH)),
          error: error === null ? null : error.slice(0, MAX_ERROR_LENGTH),
        },
      };
    }

    case "submission_drafted": {
      if (b.draft === undefined) return { ok: false, error: "draft is required" };
      if (JSON.stringify(b.draft).length > MAX_DRAFT_BYTES) {
        return { ok: false, error: `draft must be under ${MAX_DRAFT_BYTES} bytes` };
      }
      return { ok: true, event: { type: "submission_drafted", at, draft: b.draft } };
    }

    default:
      return {
        ok: false,
        error: `type must be one of: ${CLIENT_EVENT_TYPES.join(", ")}`,
      };
  }
}
