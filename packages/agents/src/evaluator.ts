import { z } from "zod";
import type { Rubric, RunEvent } from "@casebench/domain";
import { evaluatorModel, type AIProvider } from "@casebench/ai";
import { minutesElapsed, queries, userMessages } from "./activity";

export interface Submission {
  executiveSummary: string;
  evidence: string;
  caveats: string;
  recommendation: string;
}

export const SubmissionSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(4000),
  evidence: z.string().trim().max(8000),
  caveats: z.string().trim().max(4000),
  recommendation: z.string().trim().min(1).max(4000),
});

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
    `All queries (in order):`,
    ...qs.map((q, i) => `${i + 1}. ${q.sql.replace(/\s+/g, " ").slice(0, 400)} → ${q.error ? "error" : `${q.rowCount} rows`}`),
  ].join("\n");
}

export function buildEvaluatorSystemPrompt(rubric: Rubric, truth: unknown, analysis: unknown): string {
  return [
    `You grade a data analyst's submission for a work simulation. You know the ground truth about the dataset; the analyst did not.`,
    `Score each rubric criterion from ${rubric.scale.min} to ${rubric.scale.max} (integers). Use the weak/strong anchors: ${rubric.scale.max} = matches "strong", ${rubric.scale.min} = matches "weak" or missing.`,
    `Grade what the submission actually shows against what is actually true. Confident claims that contradict the truth score low. Well-supported alternative framings with honest caveats can still score well — this is not keyword matching.`,
    `Use the process log to check claims: a submission that cites numbers it never queried for deserves skepticism, and good work that shows up in the queries deserves credit.`,
    ``,
    `Rubric:`,
    ...rubric.criteria.map(
      (c) => `- ${c.key} (${c.label}): ${c.description} Weak: ${c.weak} Strong: ${c.strong}`
    ),
    ``,
    `<ground_truth>`,
    JSON.stringify(truth, null, 2),
    `</ground_truth>`,
    `<measured_facts_from_the_dataset>`,
    JSON.stringify(analysis, null, 2),
    `</measured_facts_from_the_dataset>`,
    ``,
    `Return one entry per rubric criterion (use the exact keys), 2–4 strengths, 2–4 specific improvements, and a short overall paragraph addressed to the analyst ("you").`,
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
 * Offline grader used when there's no API key: simple keyword checks, clearly
 * labelled as such. Good enough to exercise the flow; not a real grade.
 */
export function heuristicEvaluation(rubric: Rubric, s: Submission): Evaluation {
  const text = Object.values(s).join("\n").toLowerCase();
  const has = (re: RegExp) => re.test(text);
  const checks: Record<string, boolean[]> = {
    framing: [has(/per active user|active user/), has(/week|period|window/)],
    data_quality: [has(/duplicat|dedup|double[- ]count|re-?sen/), has(/5\.2|app version|app_version|mobile/)],
    segmentation: [has(/cohort|segment|campaign|paid[_ ]social|acquisition/), has(/arm|treatment|control|device|tv/)],
    reasoning: [has(/artifact|measurement|mix|composition/), has(/experiment|autoplay/)],
    recommendation: [has(/recommend|should|next step/), has(/owner|team|data eng|product|analytics/)],
    communication: [s.executiveSummary.length > 80, s.caveats.length > 20],
  };
  return {
    criteria: rubric.criteria.map((c) => {
      const hits = (checks[c.key] ?? []).filter(Boolean).length;
      return { key: c.key, score: hits * 2, justification: "Offline keyword check — configure an AI provider for a real grade." };
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
      `Executive summary:\n${submission.executiveSummary}`,
      `\nEvidence:\n${submission.evidence}`,
      `\nCaveats:\n${submission.caveats}`,
      `\nRecommendation:\n${submission.recommendation}`,
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
