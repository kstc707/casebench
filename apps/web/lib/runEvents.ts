import type { RunEvent } from "@casebench/domain";

/**
 * The only event types a browser may append directly. Everything else is
 * produced server-side by its own route: manager messages by the chat route
 * (so the AI reply is real), submission/evaluation/publish by the submit
 * route (so a client can't post its own score).
 */
export const CLIENT_EVENT_TYPES = ["brief_viewed", "resource_opened", "submission_drafted"] as const;

const MAX_DRAFT_BYTES = 50_000;
const MAX_TITLE_LENGTH = 200;

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
