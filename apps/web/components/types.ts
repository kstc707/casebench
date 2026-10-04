import type { RunEvent, RunStatus } from "@casebench/domain";
import type { ClientSafeCaseStudy, PublicPersona } from "@casebench/simulation-engine";
import type { ScoredEvaluation, Submission } from "@casebench/agents";

export type { RunEvent, RunStatus, ClientSafeCaseStudy, PublicPersona, ScoredEvaluation, Submission };

export interface RunDetail {
  id: string;
  problemSlug: string;
  status: RunStatus;
  events: RunEvent[];
}

export interface ChatMessage {
  from: string; // "you" or a persona id
  channel: string;
  text: string;
  at: string;
}
