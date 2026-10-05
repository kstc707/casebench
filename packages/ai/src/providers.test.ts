import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { OpenAICompatibleProvider, parseJsonLoose } from "./openaiCompatibleProvider";
import { agentModel, evaluatorModel, getAIProvider, providerName, resetAIProviderForTests } from "./config";

/** A fake chat-completions server: records requests, replays canned answers. */
function fakeFetch(replies: string[]) {
  const requests: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    requests.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
    const content = replies.shift() ?? "";
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }));
  }) as unknown as typeof fetch;
  return { impl, requests };
}

describe("OpenAICompatibleProvider", () => {
  it("sends a standard chat-completions request", async () => {
    const f = fakeFetch(["hey there"]);
    const p = new OpenAICompatibleProvider("https://api.example.com/v1/", "k123", f.impl);
    const text = await p.complete({ model: "m", system: "be nice", user: "hi", maxTokens: 50 });
    expect(text).toBe("hey there");
    expect(f.requests[0].url).toBe("https://api.example.com/v1/chat/completions");
    expect(f.requests[0].headers.Authorization).toBe("Bearer k123");
    expect(f.requests[0].body.messages).toEqual([
      { role: "system", content: "be nice" },
      { role: "user", content: "hi" },
    ]);
  });

  it("validates structured output and retries once with the error", async () => {
    const schema = z.object({ score: z.number().int().max(4) });
    const f = fakeFetch(['{"score": 9}', '```json\n{"score": 3}\n```']);
    const p = new OpenAICompatibleProvider("https://x/v1", "", f.impl);
    const out = await p.completeStructured({ model: "m", system: "grade", user: "s", maxTokens: 100, schema, mockValue: { score: 0 } });
    expect(out).toEqual({ score: 3 });
    expect(f.requests).toHaveLength(2);
    expect(f.requests[0].body.response_format).toEqual({ type: "json_object" });
    expect(f.requests[0].body.messages[0].content).toContain('"score"'); // schema in the prompt
    expect(f.requests[1].body.messages.at(-1).content).toContain("didn't match");
    expect(f.requests[0].headers.Authorization).toBeUndefined(); // no key, no header (Ollama)
  });

  it("gives up after two bad answers", async () => {
    const p = new OpenAICompatibleProvider("https://x/v1", "", fakeFetch(["nope", "still nope"]).impl);
    await expect(
      p.completeStructured({ model: "m", system: "", user: "", maxTokens: 10, schema: z.object({ a: z.string() }), mockValue: { a: "" } })
    ).rejects.toThrow(/invalid structured output/);
  });

  it("parses fenced or chatty JSON", () => {
    expect(parseJsonLoose('Sure! {"a": 1} hope that helps')).toEqual({ a: 1 });
    expect(parseJsonLoose("not json")).toBeUndefined();
  });
});

describe("provider selection", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetAIProviderForTests();
  });
  const clear = () => {
    for (const k of ["CASEBENCH_AI_PROVIDER", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "CASEBENCH_AGENT_MODEL", "CASEBENCH_EVALUATOR_MODEL"]) delete process.env[k];
  };

  it("defaults to offline mode with no keys", () => {
    clear();
    expect(providerName()).toBe("mock");
    expect(getAIProvider().kind).toBe("mock");
  });

  it("auto-detects a free Gemini key and picks Gemini models", () => {
    clear();
    process.env.GEMINI_API_KEY = "g";
    expect(providerName()).toBe("gemini");
    expect(getAIProvider().kind).toBe("openai-compatible");
    expect(agentModel()).toBe("gemini-3.5-flash-lite");
    expect(evaluatorModel()).toBe("gemini-3.5-flash");
  });

  it("prefers Anthropic when its key is set, and env overrides models", () => {
    clear();
    process.env.ANTHROPIC_API_KEY = "a";
    process.env.GEMINI_API_KEY = "g";
    process.env.CASEBENCH_AGENT_MODEL = "custom";
    expect(providerName()).toBe("anthropic");
    expect(agentModel()).toBe("custom");
    expect(agentModel("persona-model")).toBe("persona-model");
  });

  it("explains a missing key instead of failing mysteriously", () => {
    clear();
    process.env.CASEBENCH_AI_PROVIDER = "groq";
    expect(() => getAIProvider()).toThrow("GROQ_API_KEY is not set");
  });
});
