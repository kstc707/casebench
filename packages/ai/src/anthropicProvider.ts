import type { AIProvider, ChatMessage } from "./provider";

/**
 * Server-side Anthropic provider. Unlike the prototype (which calls the
 * API directly from the browser and only works inside an authenticated
 * Claude session), this runs server-side with a real API key — the whole
 * point of rebuilding this as a proper app instead of a single HTML file.
 */
export class AnthropicAIProvider implements AIProvider {
  constructor(
    private apiKey: string = process.env.ANTHROPIC_API_KEY ?? "",
    private model: string = "claude-sonnet-4-6"
  ) {
    if (!this.apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    const system = messages.find((m) => m.role === "system")?.content;
    const rest = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system,
        messages: rest,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textBlock = data.content?.find((c) => c.type === "text");
    return textBlock?.text ?? "";
  }
}
