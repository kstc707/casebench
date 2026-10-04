import type { ChatMessage, RunDetail, RunStatus } from "./types";

/** Thin fetch wrappers for the browser. Every call goes through our own API. */

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

const post = (url: string, body?: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export async function latestRun(problemSlug: string): Promise<RunDetail | null> {
  const { runs } = await json<{ runs: Array<{ id: string }> }>(
    await fetch(`/api/runs?problemSlug=${encodeURIComponent(problemSlug)}`)
  );
  return runs.length ? getRun(runs[0].id) : null;
}

export async function getRun(id: string): Promise<RunDetail> {
  return (await json<{ run: RunDetail }>(await fetch(`/api/runs/${id}`))).run;
}

export async function startRun(problemSlug: string): Promise<RunDetail> {
  const { run } = await json<{ run: RunDetail }>(await post("/api/runs", { problemSlug }));
  await logEvent(run.id, { type: "brief_viewed" });
  return getRun(run.id);
}

/** Fire-and-forget activity logging. A 409 (e.g. already submitted) is ignored. */
export async function logEvent(runId: string, event: Record<string, unknown>): Promise<void> {
  try {
    await post(`/api/runs/${runId}/events`, event);
  } catch {
    // Logging must never break the workspace.
  }
}

export async function getMessages(runId: string) {
  return json<{ status: RunStatus; messages: ChatMessage[] }>(await fetch(`/api/runs/${runId}/messages`));
}

export async function sendMessage(runId: string, channel: string, text: string) {
  return json<{ status: RunStatus; messages: ChatMessage[] }>(
    await post(`/api/runs/${runId}/messages`, { channel, text })
  );
}

export async function submit(runId: string, submission: unknown) {
  return json<{ evaluation: unknown }>(await post(`/api/runs/${runId}/submit`, submission));
}

export async function publish(runId: string) {
  return json<{ url: string }>(await post(`/api/runs/${runId}/publish`));
}
