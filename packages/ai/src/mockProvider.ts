import type { AIProvider, ChatMessage } from "./provider";

/**
 * Returns canned responses so UI/content work doesn't require a live API
 * key. Not meant to produce realistic manager/evaluator behavior — just
 * enough to exercise the surrounding code paths.
 */
export class MockAIProvider implements AIProvider {
  async complete(messages: ChatMessage[]): Promise<string> {
    const last = messages[messages.length - 1];
    return `[mock response to]: ${last?.content.slice(0, 80) ?? ""}`;
  }
}
