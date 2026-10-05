import type { AIProvider, CompletionRequest, StructuredRequest } from "./provider";

/**
 * Offline stand-in used when no API key is configured (local dev, tests, CI).
 * Returns whatever the caller said the mock should return, so every code path
 * around the model still runs for real.
 */
export class MockAIProvider implements AIProvider {
  readonly kind = "mock" as const;
  readonly calls: Array<CompletionRequest | StructuredRequest<unknown>> = [];

  async complete(req: CompletionRequest): Promise<string> {
    this.calls.push(req);
    return req.mock ?? "(offline mode — set ANTHROPIC_API_KEY for real agent replies)";
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<T> {
    this.calls.push(req as StructuredRequest<unknown>);
    return req.mockValue;
  }
}
