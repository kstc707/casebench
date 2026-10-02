/**
 * Provider abstraction so content authoring and UI work don't require live
 * API access, and the evaluator backend isn't locked to one vendor.
 * Swap MockAIProvider for AnthropicAIProvider (or another) via env config —
 * nothing above this interface should know which one is active.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIProvider {
  /** A single-turn or multi-turn completion call. */
  complete(messages: ChatMessage[]): Promise<string>;
}
