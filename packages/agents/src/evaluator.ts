import { z } from "zod";
import { DEFAULT_DELIVERABLE, type DeliverableSection, type Rubric, type RunEvent, type Submission } from "@casebench/domain";
import { evaluatorModel, type AIProvider } from "@casebench/ai";
import { minutesElapsed, queries, userMessages } from "./activity";

export type { Submission };

/**
 * Validates a write-up against the problem's own sections: only known keys,
 * required sections non-empty, sensible lengths.
 */
export function parseSubmission(
  body: unknown,
  sections: DeliverableSection[] = DEFAULT_DELIVERABLE
): { ok: true; submission: Submission } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  const submission: Submission = {};
  for (const sec of sections) {
    const v = b[sec.key] ?? "";
    if (typeof v !== "string") return { ok: false, error: `${sec.label} must be text` };
    if (v.length > 8000) return { ok: false, error: `${sec.label} is too long (max 8000 characters)` };
    if (sec.required && !v.trim()) return { ok: false, error: `${sec.label} is required` };
    submission[sec.key] = v.trim();
  }
  return { ok: true, submission };
}

export function formatSubmission(submission: Submission, sections: DeliverableSection[] = DEFAULT_DELIVERABLE): string {
  return sections.map((s) => `${s.label}:\n${submission[s.key] || "(empty)"}`).join("\n\n");
}

export const EvaluationSchema = z.object({
  criteria: z.array(
    z.object({
      key: z.string(),
      score: z.number().int().min(0).max(4),
      justification: z.string(),
    })
  ),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  overallFeedback: z.string(),
});
export type Evaluation = z.infer<typeof EvaluationSchema>;

export interface ScoredEvaluation extends Evaluation {
  /** Weighted score 0–100, computed in code from the per-criterion scores. */
  score: number;
  gradedBy: "ai" | "offline-heuristic";
}

/** Process evidence: what the user actually did, so claims can be checked against work. */
export function processSummary(events: RunEvent[]): string {
  const qs = queries(events);
  const end = events.find((e) => e.type === "submission_finalized");
  const minutes = end ? minutesElapsed(events, Date.parse(end.at)) : 0;
  return [
    `Minutes from start to submission: ${Math.round(minutes)}`,
    `Queries run: ${qs.length}`,
    `Messages sent to coworkers: ${userMessages(events).length}`,
    `Hints requested ("I'm stuck"): ${events.filter((e) => e.type === "hint_requested").length}`,
    `All queries (in order):`,
    ...qs.map((q, i) => `${i + 1}. ${q.sql.replace(/\s+/g, " ").slice(0, 400)} → ${q.error ? "error" : `${q.rowCount} rows`}`),
  ].join("\n");
}

export function buildEvaluatorSystemPrompt(rubric: Rubric, truth: unknown, analysis: unknown): string {
  return [
    `You grade a submission for a professional work simulation. You know the ground truth about the situation; the person being graded did not.`,
    `Score each rubric criterion from ${rubric.scale.min} to ${rubric.scale.max} (integers). Use the weak/strong anchors: ${rubric.scale.max} = matches "strong", ${rubric.scale.min} = matches "weak" or missing.`,
    `Grade what the submission actually shows against what is actually true. Confident claims that contradict the truth score low. Well-supported alternative framings with honest caveats can still score well — this is not keyword matching.`,
    `Use the process log to check claims: a submission that cites numbers it never queried for deserves skepticism, and good work that shows up in the process deserves credit. Asking for hints is fine; mention it in feedback only if they leaned on hints for the key insight.`,
    ``,
    `Rubric:`,
    ...rubric.criteria.map(
      (c) => `- ${c.key} (${c.label}): ${c.description} Weak: ${c.weak} Strong: ${c.strong}`
    ),
    ``,
    `<ground_truth>`,
    JSON.stringify(truth, null, 2),
    `</ground_truth>`,
    ...(analysis
      ? [`<measured_facts_from_the_dataset>`, JSON.stringify(analysis, null, 2), `</measured_facts_from_the_dataset>`]
      : []),
    ``,
    `Return one entry per rubric criterion (use the exact keys), 2–4 strengths, 2–4 specific improvements, and a short overall paragraph addressed to the person ("you").`,
  ].join("\n");
}

export function weightedScore(rubric: Rubric, evaluation: Evaluation): number {
  const max = rubric.scale.max;
  let total = 0;
  let weights = 0;
  for (const c of rubric.criteria) {
    const s = evaluation.criteria.find((x) => x.key === c.key)?.score ?? 0;
    total += (s / max) * c.weight;
    weights += c.weight;
  }
  return Math.round((total / weights) * 100);
}

/**
 * Offline grader used when there's no AI provider: each rubric criterion's
 * offlineKeywords are regex groups; every group found earns 2 points (max 4).
 * Criteria without keywords (e.g. fresh Studio scenarios) score on effort:
 * 2 points past 100 characters, 4 past 500. Clearly labelled as
 * offline — good enough to exercise the flow, not a real grade.
 */
export function heuristicEvaluation(rubric: Rubric, s: Submission): Evaluation {
  const text = Object.values(s).join("\n").toLowerCase();
  return {
    criteria: rubric.criteria.map((c) => {
      const groups = c.offlineKeywords ?? [];
      const hits = groups.length
        ? groups.filter((g) => new RegExp(g, "i").test(text)).length
        : (text.length >= 100 ? 1 : 0) + (text.length >= 500 ? 1 : 0); // no keywords: effort only
      return {
        key: c.key,
        score: Math.min(rubric.scale.max, hits * 2),
        justification: "Offline keyword check — configure an AI provider for a real grade.",
      };
    }),
    strengths: ["Offline mode: graded by keyword checks only."],
    improvements: ["Configure an AI provider (see docs/deploy.md) for real, truth-grounded feedback."],
    overallFeedback: "This grade comes from the offline heuristic, not the AI evaluator.",
  };
}

export async function evaluateSubmission(args: {
  provider: AIProvider;
  rubric: Rubric;
  truth: unknown;
  analysis: unknown;
  submission: Submission;
  sections?: DeliverableSection[];
  events: RunEvent[];
}): Promise<ScoredEvaluation> {
  const { provider, rubric, submission } = args;
  const mockValue = heuristicEvaluation(rubric, submission);
  const evaluation = await provider.completeStructured({
    model: evaluatorModel(),
    maxTokens: 16000,
    effort: "high",
    system: buildEvaluatorSystemPrompt(rubric, args.truth, args.analysis),
    user: [
      `<submission>`,
      formatSubmission(submission, args.sections),
      `</submission>`,
      ``,
      `<process_log>`,
      processSummary(args.events),
      `</process_log>`,
    ].join("\n"),
    schema: EvaluationSchema,
    mockValue,
  });
  return {
    ...evaluation,
    score: weightedScore(rubric, evaluation),
    gradedBy: provider.kind === "mock" ? "offline-heuristic" : "ai",
  };
}
