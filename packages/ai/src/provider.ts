import type { z } from "zod";

/**
 * Provider abstraction: the rest of the app asks for "a completion" or "a
 * structured result" and never knows whether it came from Claude or from the
 * offline mock. That keeps UI work, tests, and CI free of API keys and costs.
 */

export interface CompletionRequest {
  model: string;
  system: string;
  /** The single user turn (activity summary + transcript + instruction). */
  user: string;
  maxTokens: number;
  /** What the offline mock should return for this request. */
  mock?: string;
}

export interface StructuredRequest<T> extends Omit<CompletionRequest, "mock"> {
  schema: z.ZodType<T>;
  effort?: "low" | "medium" | "high";
  /** What the offline mock should return for this request. */
  mockValue: T;
}

export interface AIProvider {
  readonly kind: "anthropic" | "openai-compatible" | "mock";
  complete(req: CompletionRequest): Promise<string>;
  completeStructured<T>(req: StructuredRequest<T>): Promise<T>;
}

export class AIRefusalError extends Error {
  constructor(public category: string | null) {
    super(`Model declined the request${category ? ` (${category})` : ""}`);
    this.name = "AIRefusalError";
  }
}
