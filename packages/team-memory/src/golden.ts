/**
 * The golden questions: load them, search them, score them.
 *
 * Shared by the eval report (`eval/run.ts`) and the CI test
 * (`src/golden.test.ts`), so the numbers the report prints and the numbers
 * the test checks can't drift apart.
 *
 * The question sets live in `eval/`: calibration.json (what the warning line in
 * search.ts was chosen on) and heldout.json (only measured, never tuned on).
 * An expected passage is named by file + a quote, not by line numbers, which
 * move whenever someone adds a note above them.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCorpus, type Passage } from "./corpus";
import { buildIndex, search, type SearchIndex, type SearchResponse } from "./search";

export interface GoldenQuestion {
  id: string;
  q: string;
  /** answerable: the memory holds it; near-miss: on-topic but it doesn't; off-topic: not about our work. */
  kind: "answerable" | "near-miss" | "off-topic";
  /** Answerable only: any of these passages counts as the answer. */
  expect?: { file: string; quote: string }[];
  /** A short, casual question with words our notes never use (low known share); see heldout.json. */
  casual?: boolean;
}

export const QUESTION_SETS = ["calibration", "heldout"] as const;
export type QuestionSetName = (typeof QUESTION_SETS)[number];

const EVAL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "eval");

export function loadQuestions(set: QuestionSetName): GoldenQuestion[] {
  return (JSON.parse(readFileSync(path.join(EVAL_DIR, `${set}.json`), "utf-8")) as { questions: GoldenQuestion[] })
    .questions;
}

/**
 * The team journal records the eval runs themselves, quoting these questions,
 * so it is left out of the eval index (production search still includes it).
 */
export const EVAL_EXCLUDED_DIR = ".claude/team/journal/";

export function buildEvalIndex(root: string): SearchIndex {
  return buildIndex(loadCorpus(root).filter((p) => !p.file.startsWith(EVAL_EXCLUDED_DIR)));
}

/** Read files once per run: the same file is checked for many quotes and passages. */
function fileReader(root: string) {
  const cache = new Map<string, string>();
  return (file: string) => {
    if (!cache.has(file)) cache.set(file, readFileSync(path.join(root, file), "utf-8"));
    return cache.get(file)!;
  };
}

/** The 1-based line ranges of every occurrence of `quote` in `text` (empty if it's gone). */
export function quoteLines(text: string, quote: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (let at = text.indexOf(quote); at >= 0; at = text.indexOf(quote, at + 1)) {
    const start = text.slice(0, at).split("\n").length;
    ranges.push([start, start + quote.split("\n").length - 1]);
  }
  return ranges;
}

/** Does the passage's text equal the file lines it cites? (The citation invariant.) */
export function citesRealLines(fileText: string, p: Passage): boolean {
  return fileText.split(/\r?\n/).slice(p.startLine - 1, p.endLine).join("\n") === p.text;
}

/** Lowercase, whitespace runs to one space: how "verbatim" is compared. */
export function normaliseForQuote(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Where `text` appears verbatim (see normaliseForQuote) in the indexed memory,
 * as `file:line` of each passage that holds it. Used to catch eval questions
 * quoted in the team's notes: such a passage matches every word of the
 * question and crowds the real answer out of the top 3.
 */
export function verbatimIn(index: SearchIndex, text: string): string[] {
  // The final ?.! is dropped from the question, so a note quoting it without one is still caught.
  const needle = normaliseForQuote(text).replace(/[?.!]+$/, "");
  if (needle === "") return [];
  return index.passages
    .filter((p) => normaliseForQuote(p.text).includes(needle))
    .map((p) => `${p.file}:${p.startLine}`);
}

export interface ScoredQuestion {
  question: GoldenQuestion;
  /** The top 3, as `team:ask` would show them. */
  response: SearchResponse;
  /**
   * Answerable only: 1-based rank of the first expected passage in the FULL
   * ranking (not just the top 3), or null if no expected passage scored at all.
   */
  rank: number | null;
  /** Expected quotes no longer in their file. */
  stale: { file: string; quote: string }[];
  /** Expected quotes found more than once in their file (any occurrence counts). */
  repeated: { file: string; quote: string; count: number }[];
  /** Top-3 passages whose text isn't the file lines they cite. */
  badCitations: string[];
}

/** Search every question of a set and score it against its expected passages. */
export function scoreSet(index: SearchIndex, root: string, questions: GoldenQuestion[], limit = 3): ScoredQuestion[] {
  const read = fileReader(root);
  return questions.map((question) => {
    const full = search(index, question.q, index.passages.length);
    const response = { ...full, results: full.results.slice(0, limit) };
    const stale: ScoredQuestion["stale"] = [];
    const repeated: ScoredQuestion["repeated"] = [];
    let rank: number | null = null;
    if (question.kind === "answerable") {
      const targets = (question.expect ?? []).flatMap((e) => {
        const ranges = quoteLines(read(e.file), e.quote);
        if (ranges.length === 0) stale.push(e);
        if (ranges.length > 1) repeated.push({ ...e, count: ranges.length });
        return ranges.map((lines) => ({ file: e.file, lines }));
      });
      const at = full.results.findIndex(({ passage: p }) =>
        targets.some((t) => t.file === p.file && p.startLine <= t.lines[1] && p.endLine >= t.lines[0])
      );
      rank = at >= 0 ? at + 1 : null;
    }
    const badCitations = response.results
      .filter(({ passage: p }) => !citesRealLines(read(p.file), p))
      .map(({ passage: p }) => `${p.file}:${p.startLine}-${p.endLine}`);
    return { question, response, rank, stale, repeated, badCitations };
  });
}

export interface SetSummary {
  answerable: number;
  /** Answerable questions with an expected passage in the top 3. */
  hitsAt3: number;
  /**
   * Mean reciprocal rank over answerable questions: 1/rank of the first
   * expected passage, 0 if it never ranks. 1.0 means every answer is at rank 1;
   * unlike hit@3 it drops when an answer slips from rank 1 to rank 2.
   */
  mrr: number;
}

export function summarize(scored: ScoredQuestion[]): SetSummary {
  const answerable = scored.filter((s) => s.question.kind === "answerable");
  return {
    answerable: answerable.length,
    hitsAt3: answerable.filter((s) => s.rank !== null && s.rank <= 3).length,
    mrr: answerable.length === 0 ? 0 : answerable.reduce((a, s) => a + (s.rank ? 1 / s.rank : 0), 0) / answerable.length,
  };
}
