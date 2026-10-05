import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AIRefusalError, type AIProvider, type CompletionRequest, type StructuredRequest } from "./provider";

/**
 * Calls Claude through the official SDK, server-side only. The API key comes
 * from the environment (ANTHROPIC_API_KEY) and never reaches the browser —
 * the prototype's biggest limitation was calling the API from the page.
 */
export class AnthropicAIProvider implements AIProvider {
  readonly kind = "anthropic" as const;
  private client = new Anthropic();

  /** Agent chat messages: one short call, plain text back. */
  async complete(req: CompletionRequest): Promise<string> {
    const response = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    });
    if (response.stop_reason === "refusal") {
      throw new AIRefusalError(response.stop_details?.category ?? null);
    }
    return response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
  }

  /**
   * Grading: the response must match a schema (structured outputs), so the
   * app gets typed scores instead of parsing free text. Server-side fallbacks
   * re-run the request on another model if the first one declines.
   */
  async completeStructured<T>(req: StructuredRequest<T>): Promise<T> {
    const response = await this.client.beta.messages.parse({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: req.effort ?? "high",
        format: betaZodOutputFormat(req.schema),
      },
    });
    if (response.stop_reason === "refusal") {
      throw new AIRefusalError(response.stop_details?.category ?? null);
    }
    if (!response.parsed_output) {
      throw new Error(`Structured output missing (stop_reason: ${response.stop_reason})`);
    }
    return response.parsed_output as T;
  }
}
