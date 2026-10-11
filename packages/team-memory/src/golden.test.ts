/**
 * The golden questions (eval/calibration.json + eval/heldout.json) as CI checks.
 * This test is the gate; `pnpm --filter @casebench/team-memory eval` prints the same numbers in detail.
 *
 * The memory changes every day (journal, lessons, decisions), so this test is
 * built not to flake on normal growth:
 *
 * - HARD rules, which hold however the memory grows:
 *   1. no answerable question is ever labelled "nothing related" (hiding a real
 *      answer is the owner's worst failure). heldout.json's "casual" questions
 *      (low known share) make this bite: a rule that hides low-overlap
 *      questions fails here;
 *   2. every expected quote is still in its file (edit a memory file so an
 *      answer's anchor disappears, and the test names the question and quote);
 *   3. nonsense (random letters from a fixed seed) gets "nothing related";
 *   4. every top-3 passage is exactly the file lines it cites;
 *   5. no eval question is quoted verbatim in the indexed memory. A note that
 *      quotes a question matches every word of it and crowds the real answer
 *      out (the journal is left out of the index for exactly this reason).
 * - SOFT FLOORS for ranking, per set: hit@3 and MRR must not fall below floors
 *   set a little under today's numbers. Not exact counts, because a new note
 *   can legitimately outrank an expected passage for one question (it may even
 *   be a better answer); the floors catch a real ranking regression (several
 *   answers dropping) without failing on that drift.
 *
 *   If growth alone trips a floor, first find which new passage outranks the
 *   expected one: if it states the same fact, add it as an expected anchor;
 *   otherwise rephrase the new note. Never lower a floor to pass.
 *
 * Failure messages name questions by set + id only, never their text, so a
 * pasted failure can't put the question into the notes (rule 5).
 *
 * Uses the same journal-excluded index as the eval script (both go through src/golden.ts).
 */
import { describe, expect, it } from "vitest";
import { findRepoRoot } from "./corpus";
import { buildEvalIndex, loadQuestions, QUESTION_SETS, scoreSet, summarize, verbatimIn } from "./golden";
import { search, tokenize } from "./search";

/**
 * Floors, measured Oct 2026 (step 5): calibration hit@3 10/14, MRR 0.599;
 * held-out hit@3 17/20, MRR 0.640.
 *
 * hit@3: two below today, so one or two answers can be pushed out by honest
 * growth (the tester showed a single plausible lesson bullet costs one).
 * MRR 0.50: one answer falling from rank 1 out of the ranking costs 1/14 ≈ 0.07
 * (calibration) or 1/20 = 0.05 (held-out); one rank-1 → rank-2 slip costs half
 * that. 0.50 allows about two such losses per set.
 *
 * Mutation-checked (step 5): an empty synonym list (calibration MRR 0.456),
 * no stemming (held-out hit@3 13/20) and idf switched off (both sets) each trip
 * a floor; the synonym one is caught by the MRR floor alone, which is why there
 * are two. BM25's b = 1.0 instead of 0.75 is NOT caught (calibration 9/14,
 * MRR 0.567; held-out improves): it's a different tuning, not a clear regression.
 */
const FLOORS = {
  calibration: { hitAt3: 8, mrr: 0.5 },
  heldout: { hitAt3: 15, mrr: 0.5 },
} as const;

const CONTAMINATION_MESSAGE = "don't quote eval questions in the team's notes — paraphrase or cite by id";

/** mulberry32: a tiny seeded random number generator, so the nonsense is the same on every run. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` strings of 2–4 random 5–8-letter "words". */
function nonsense(seed: number, count: number): string[] {
  const rand = seededRandom(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const word = () => Array.from({ length: int(5, 8) }, () => "abcdefghijklmnopqrstuvwxyz"[int(0, 25)]).join("");
  return Array.from({ length: count }, () => Array.from({ length: int(2, 4) }, word).join(" "));
}

const NONSENSE = nonsense(20261011, 3);

const root = findRepoRoot();
const index = buildEvalIndex(root);

for (const set of QUESTION_SETS) {
  describe(`golden questions: ${set}.json`, () => {
    const questions = loadQuestions(set);
    const scored = scoreSet(index, root, questions);
    const answerable = scored.filter((s) => s.question.kind === "answerable");
    const name = (q: { id: string }) => `${set} ${q.id}`;

    it("has answerable questions to check", () => {
      expect(answerable.length).toBeGreaterThan(0);
    });

    it.each(answerable.map((s) => [s.question.id, s] as const))(
      "%s: shows passages (never \"nothing related\") and its expected quotes are still in their files",
      (_id, s) => {
        expect(s.response.label, `${name(s.question)} was labelled "nothing related"`).toBe("closest");
        expect(s.question.expect?.length ?? 0, `${name(s.question)} has no expected passage`).toBeGreaterThan(0);
        const stale = s.stale.map((e) => `"${e.quote}" is no longer in ${e.file}`);
        expect(stale, `${name(s.question)}: expected quote missing (stale anchor)`).toEqual([]);
      }
    );

    it.each(scored.map((s) => [s.question.id, s] as const))("%s: every top-3 passage cites real file lines", (_id, s) => {
      expect(s.badCitations, `${name(s.question)}: passages whose text isn't the cited lines`).toEqual([]);
    });

    it.each(questions.map((q) => [q.id, q] as const))("%s: is not quoted verbatim in the indexed memory", (_id, q) => {
      expect(verbatimIn(index, q.q), `${name(q)} is quoted at these places: ${CONTAMINATION_MESSAGE}`).toEqual([]);
    });

    it(`ranking stays at or above the floors (hit@3 ≥ ${FLOORS[set].hitAt3}/${answerable.length}, MRR ≥ ${FLOORS[set].mrr})`, () => {
      const { hitsAt3, answerable: n, mrr } = summarize(scored);
      const missed = answerable
        .filter((s) => s.rank === null || s.rank > 3)
        .map((s) => `${s.question.id}(rank ${s.rank ?? "none"})`)
        .join(" ");
      const summary = `${set}: hit@3 ${hitsAt3}/${n}, MRR ${mrr.toFixed(3)}, outside top 3: ${missed || "none"}`;
      console.log(`[golden] ${summary}`);
      expect(hitsAt3, `hit@3 below the floor ${FLOORS[set].hitAt3}. ${summary}`).toBeGreaterThanOrEqual(FLOORS[set].hitAt3);
      expect(mrr, `MRR below the floor ${FLOORS[set].mrr}. ${summary}`).toBeGreaterThanOrEqual(FLOORS[set].mrr);
    });
  });
}

describe("golden: nonsense (seeded random letters)", () => {
  it.each(NONSENSE.map((q, i) => [i + 1, q] as const))("nonsense #%i → nothing related", (n, q) => {
    const inMemory = tokenize(q).filter((t) => index.docFreq.has(t));
    expect(inMemory, `nonsense #${n} has words that are in the memory; change the seed`).toEqual([]);
    expect(verbatimIn(index, q), `nonsense #${n} is quoted at these places: ${CONTAMINATION_MESSAGE}`).toEqual([]);
    const r = search(index, q, 3);
    expect(r.label, `nonsense #${n} got passages`).toBe("nothing related");
    expect(r.results).toEqual([]);
  });
});
