import { AnthropicAIProvider } from "./anthropicProvider";
import { MockAIProvider } from "./mockProvider";
import { OpenAICompatibleProvider } from "./openaiCompatibleProvider";
import type { AIProvider } from "./provider";

/**
 * Which AI service powers the agents and the grader. Pick one with
 * CASEBENCH_AI_PROVIDER, or let it auto-detect from whichever key is set:
 *
 *   anthropic   ANTHROPIC_API_KEY    Claude (paid, pay-as-you-go)
 *   gemini      GEMINI_API_KEY       Google Gemini (free tier)
 *   groq        GROQ_API_KEY         Groq (free tier, open models)
 *   openrouter  OPENROUTER_API_KEY   OpenRouter (free ":free" models)
 *   ollama      (no key)             Ollama on your own computer (free, local only)
 *   openai-compatible  CASEBENCH_LLM_BASE_URL + CASEBENCH_LLM_API_KEY  anything else
 *   mock        (no key)             offline mode: scripted agents, heuristic grading
 *
 * Agents chat a lot, so they default to a small, fast model; grading is rare
 * and must be careful, so it defaults to a stronger one. Override either with
 * CASEBENCH_AGENT_MODEL / CASEBENCH_EVALUATOR_MODEL; a persona can also name
 * its own model in its JSON file.
 */

interface Preset {
  baseUrl: string;
  keyEnv: string | null;
  agentModel: string;
  evaluatorModel: string;
}

export const PRESETS: Record<string, Preset> = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_API_KEY",
    agentModel: "gemini-3.5-flash-lite",
    evaluatorModel: "gemini-3.5-flash",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    agentModel: "llama-3.1-8b-instant",
    evaluatorModel: "llama-3.3-70b-versatile",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    agentModel: "meta-llama/llama-3.3-70b-instruct:free",
    evaluatorModel: "meta-llama/llama-3.3-70b-instruct:free",
  },
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    keyEnv: null,
    agentModel: "llama3.2",
    evaluatorModel: "llama3.2",
  },
};

const ANTHROPIC_MODELS = { agentModel: "claude-haiku-4-5", evaluatorModel: "claude-opus-5-5" };

export function providerName(): string {
  const explicit = process.env.CASEBENCH_AI_PROVIDER;
  if (explicit) return explicit;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  return "mock";
}

function defaults() {
  const name = providerName();
  if (name === "anthropic" || name === "mock") return ANTHROPIC_MODELS;
  return PRESETS[name] ?? { agentModel: "", evaluatorModel: "" };
}

export function agentModel(personaModel?: string): string {
  return personaModel ?? process.env.CASEBENCH_AGENT_MODEL ?? defaults().agentModel;
}

export function evaluatorModel(): string {
  return process.env.CASEBENCH_EVALUATOR_MODEL ?? defaults().evaluatorModel;
}

let cached: AIProvider | undefined;

export function getAIProvider(): AIProvider {
  if (cached) return cached;
  const name = providerName();
  if (name === "anthropic") {
    cached = new AnthropicAIProvider();
  } else if (name === "mock") {
    cached = new MockAIProvider();
  } else if (name === "openai-compatible") {
    const baseUrl = process.env.CASEBENCH_LLM_BASE_URL;
    if (!baseUrl) throw new Error("CASEBENCH_LLM_BASE_URL is required for openai-compatible");
    cached = new OpenAICompatibleProvider(baseUrl, process.env.CASEBENCH_LLM_API_KEY ?? "");
  } else {
    const preset = PRESETS[name];
    if (!preset) throw new Error(`Unknown CASEBENCH_AI_PROVIDER: ${name}`);
    const key = preset.keyEnv ? process.env[preset.keyEnv] ?? "" : "";
    if (preset.keyEnv && !key) throw new Error(`${preset.keyEnv} is not set`);
    cached = new OpenAICompatibleProvider(process.env.CASEBENCH_LLM_BASE_URL ?? preset.baseUrl, key);
  }
  return cached;
}

/** Tests only: forget the cached provider so env changes take effect. */
export function resetAIProviderForTests() {
  cached = undefined;
}
