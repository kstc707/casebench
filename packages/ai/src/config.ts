import { AnthropicAIProvider } from "./anthropicProvider";
import { MockAIProvider } from "./mockProvider";
import type { AIProvider } from "./provider";

/**
 * Model choices. Agents chat a lot, so they default to a small, fast, cheap
 * model; grading is rare and must be careful, so it defaults to the most
 * capable one. Both can be overridden per deployment with env vars, and a
 * persona can name its own model in its JSON file.
 */
export const DEFAULT_AGENT_MODEL = "claude-haiku-4-5";
export const DEFAULT_EVALUATOR_MODEL = "claude-opus-5-5";

export function agentModel(personaModel?: string): string {
  return personaModel ?? process.env.CASEBENCH_AGENT_MODEL ?? DEFAULT_AGENT_MODEL;
}

export function evaluatorModel(): string {
  return process.env.CASEBENCH_EVALUATOR_MODEL ?? DEFAULT_EVALUATOR_MODEL;
}

let cached: AIProvider | undefined;

/**
 * CASEBENCH_AI_PROVIDER=anthropic|mock picks explicitly; otherwise Claude is
 * used when ANTHROPIC_API_KEY is set, and the offline mock when it isn't.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  const choice =
    process.env.CASEBENCH_AI_PROVIDER ?? (process.env.ANTHROPIC_API_KEY ? "anthropic" : "mock");
  cached = choice === "anthropic" ? new AnthropicAIProvider() : new MockAIProvider();
  return cached;
}
