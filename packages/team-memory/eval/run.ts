/**
 * Measure the librarian search on the question sets in this folder.
 *
 *   pnpm --filter @casebench/team-memory eval
 *
 * For each set: whether the first expected passage is in the top 3 (hit@3),
 * the mean reciprocal rank (MRR: 1/rank of that passage in the full ranking,
 * averaged; it shows a rank-1 → rank-2 slip that hit@3 hides), and how many
 * questions of each kind got each label ("closest+warning" is
 * "closest" with lowOverlap set). calibration.json is
 * what the low-overlap warning line in src/search.ts was chosen on; heldout.json is only
 * reported, never tuned on. A quote that occurs more than once in its file
 * counts wherever it occurs, and is printed as a NOTE.
 *
 * Expected passages are named by file + a quote (not line numbers, which move
 * whenever someone adds a note above them). A quote that's no longer in its
 * file is reported as STALE, so the set can't silently rot.
 *
 * This script only reports: it exits non-zero only for stale quotes. The gate
 * is the CI test src/golden.test.ts, which turns these numbers into hard rules
 * and floors. Both load and score through src/golden.ts, so they can't drift.
 */
import { findRepoRoot } from "../src/corpus";
import { buildEvalIndex, EVAL_EXCLUDED_DIR, loadQuestions, QUESTION_SETS, scoreSet, summarize } from "../src/golden";

const root = findRepoRoot();
// Same index as src/golden.test.ts: without the journal, which quotes these questions.
const index = buildEvalIndex(root);
console.log(`Index excludes ${EVAL_EXCLUDED_DIR}** (it quotes the eval questions); production search includes it.`);
let stale = 0;

for (const set of QUESTION_SETS) {
  const questions = loadQuestions(set);
  const table: Record<string, Record<string, number>> = {};
  console.log(`\n=== ${set}.json (${questions.length} questions, ${index.passages.length} passages)`);
  const scored = scoreSet(index, root, questions);
  for (const { question: q, response: r, rank, stale: gone, repeated } of scored) {
    for (const e of gone) console.log(`  STALE ${q.id}: "${e.quote}" is no longer in ${e.file}`);
    for (const e of repeated) console.log(`  NOTE  ${q.id}: "${e.quote}" occurs ${e.count}× in ${e.file}; any of them counts`);
    stale += gone.length;
    // The rank in the full ranking; "(miss)" when it's below the top 3, "none" when it never scored.
    const shownRank = q.kind !== "answerable" ? "-" : rank === null ? "none" : rank <= 3 ? String(rank) : `${rank}(miss)`;
    const shown = r.label === "closest" ? (r.lowOverlap ? "closest+warning" : "closest") : r.label;
    (table[q.kind] ??= {})[shown] = (table[q.kind][shown] ?? 0) + 1;
    const top = r.results[0];
    console.log(
      `  ${q.id.padEnd(4)} ${q.kind.padEnd(10)} ${shown.padEnd(15)} rank=${shownRank.padEnd(8)} ` +
        `known=${r.knownShare.toFixed(2)} cov=${r.coverage.toFixed(2)} ${top ? `${top.passage.file}:${top.passage.startLine}` : ""}` +
        (r.unknownTerms.length ? ` unknown=[${r.unknownTerms.join(",")}]` : "")
    );
  }
  const { answerable, hitsAt3, mrr } = summarize(scored);
  console.log(`  hit@3 ${hitsAt3}/${answerable}   MRR ${mrr.toFixed(3)}`);
  const columns = ["closest", "closest+warning", "nothing related"];
  console.log(`  ${"".padEnd(12)}${columns.map((c) => c.padStart(17)).join("")}`);
  for (const [kind, counts] of Object.entries(table)) {
    console.log(`  ${kind.padEnd(12)}${columns.map((c) => String(counts[c] ?? 0).padStart(17)).join("")}`);
  }
}
if (stale > 0) {
  console.log(`\n${stale} expected quote(s) are stale; fix the question files.`);
  process.exitCode = 1;
}
