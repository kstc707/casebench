import { z } from "zod";
import { AIRefusalError, type AIProvider, type CompletionRequest, type StructuredRequest } from "./provider";

/**
 * Talks to any service that speaks the OpenAI "chat completions" format.
 * Most providers do — including ones with free tiers — so one adapter covers:
 *
 *   Google Gemini (free tier), Groq (free tier), OpenRouter (free models),
 *   Ollama (free, runs on your own computer), and many others.
 *
 * Plain fetch, no vendor SDK: the request is a single JSON POST.
 */
/** True for rate limits and overloads (429/5xx), which may succeed later or on another model. */
export function isTransientAIError(err: unknown): boolean {
  return err instanceof Error && /^LLM API error (429|5\d\d)\b/.test(err.message);
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly kind = "openai-compatible" as const;

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private fetchImpl: typeof fetch = fetch,
    /** Waits between retries; injectable so tests don't sleep. */
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
  ) {}

  private async chat(body: Record<string, unknown>): Promise<string> {
    // Free tiers often answer 429 (rate limit) or 503 ("high demand") for a
    // few seconds. Retry those briefly; anything else (bad key, retired
    // model) fails immediately because waiting won't fix it.
    const delays = [1000, 3000];
    let res: Response;
    for (let attempt = 0; ; attempt++) {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const transient = res.status === 429 || res.status >= 500;
      if (res.ok || !transient || attempt >= delays.length) break;
      await this.sleep(delays[attempt]);
    }
    if (!res.ok) {
      throw new Error(`LLM API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }>;
    };
    const choice = data.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === "content_filter") {
      throw new AIRefusalError(null);
    }
    return (choice?.message?.content ?? "").trim();
  }

  async complete(req: CompletionRequest): Promise<string> {
    return this.chat({
      model: req.model,
      max_tokens: req.maxTokens,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    });
  }

  /**
   * Structured output, portably: ask for JSON matching a schema (shown in the
   * prompt), validate it with Zod, and retry once with the validation error if
   * the model got it wrong. Not every provider supports strict schemas, but
   * they all support "respond with a JSON object".
   */
  async completeStructured<T>(req: StructuredRequest<T>): Promise<T> {
    const schema = JSON.stringify(z.toJSONSchema(req.schema));
    const messages: Array<{ role: string; content: string }> = [
      {
        role: "system",
        content: `${req.system}\n\nRespond with ONLY a JSON object that matches this JSON Schema:\n${schema}`,
      },
      { role: "user", content: req.user },
    ];
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await this.chat({
        model: req.model,
        max_tokens: req.maxTokens,
        response_format: { type: "json_object" },
        messages,
      });
      const parsed = req.schema.safeParse(parseJsonLoose(text));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.message.slice(0, 1000);
      messages.push(
        { role: "assistant", content: text },
        { role: "user", content: `That JSON didn't match the schema: ${lastError}\nReturn the corrected JSON object only.` }
      );
    }
    throw new Error(`Model returned invalid structured output: ${lastError}`);
  }
}

/** Accepts bare JSON or JSON wrapped in a ```json code fence. */
export function parseJsonLoose(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}
