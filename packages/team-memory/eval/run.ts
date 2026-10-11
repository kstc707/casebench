/**
 * Measure the librarian search on the question sets in this folder.
 *
 *   pnpm --filter @casebench/team-memory eval
 *
 * For each set: the rank of the first expected passage in the top 3 (hit@3),
 * and how many questions of each kind got each label ("closest+warning" is
 * "closest" with lowOverlap set). calibration.json is
 * what the low-overlap warning line in src/search.ts was chosen on; heldout.json is only
 * reported, never tuned on. A quote that occurs more than once in its file
 * counts wherever it occurs, and is printed as a NOTE.
 *
 * Expected passages are named by file + a quote (not line numbers, which move
 * whenever someone adds a note above them). A quote that's no longer in its
 * file is reported as STALE, so the set can't silently rot.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRepoRoot, loadCorpus } from "../src/corpus";
import { buildIndex, search } from "../src/search";

interface Question {
  id: string;
  q: string;
  kind: "answerable" | "near-miss" | "off-topic";
  expect?: { file: string; quote: string }[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = findRepoRoot();
// The team journal records the eval runs themselves, quoting these questions,
// so it is left out here (production search still includes it).
const JOURNAL = ".claude/team/journal/";
const index = buildIndex(loadCorpus(root).filter((p) => !p.file.startsWith(JOURNAL)));
console.log(`Index excludes ${JOURNAL}** (it quotes the eval questions); production search includes it.`);
let stale = 0;

/** The 1-based line ranges of every occurrence of a quote in a file (empty if it's gone). */
function quoteLines(file: string, quote: string): [number, number][] {
  const text = readFileSync(path.join(root, file), "utf-8");
  const ranges: [number, number][] = [];
  for (let at = text.indexOf(quote); at >= 0; at = text.indexOf(quote, at + 1)) {
    const start = text.slice(0, at).split("\n").length;
    ranges.push([start, start + quote.split("\n").length - 1]);
  }
  return ranges;
}

for (const set of ["calibration", "heldout"]) {
  const { questions } = JSON.parse(readFileSync(path.join(here, `${set}.json`), "utf-8")) as { questions: Question[] };
  const table: Record<string, Record<string, number>> = {};
  let answerable = 0;
  let hits = 0;
  console.log(`\n=== ${set}.json (${questions.length} questions, ${index.passages.length} passages)`);
  for (const q of questions) {
    const r = search(index, q.q, 3);
    let rank = "";
    if (q.kind === "answerable") {
      answerable++;
      const targets = (q.expect ?? []).flatMap((e) => {
        const ranges = quoteLines(e.file, e.quote);
        if (ranges.length === 0) {
          stale++;
          console.log(`  STALE ${q.id}: "${e.quote}" is no longer in ${e.file}`);
        }
        if (ranges.length > 1) console.log(`  NOTE  ${q.id}: "${e.quote}" occurs ${ranges.length}× in ${e.file}; any of them counts`);
        return ranges.map((lines) => ({ file: e.file, lines }));
      });
      const at = r.results.findIndex(({ passage: p }) =>
        targets.some((t) => t.file === p.file && p.startLine <= t.lines[1] && p.endLine >= t.lines[0])
      );
      if (at >= 0) hits++;
      rank = at >= 0 ? String(at + 1) : "miss";
    }
    const shown = r.label === "closest" ? (r.lowOverlap ? "closest+warning" : "closest") : r.label;
    (table[q.kind] ??= {})[shown] = (table[q.kind][shown] ?? 0) + 1;
    const top = r.results[0];
    console.log(
      `  ${q.id.padEnd(4)} ${q.kind.padEnd(10)} ${shown.padEnd(15)} rank=${(rank || "-").padEnd(4)} ` +
        `known=${r.knownShare.toFixed(2)} cov=${r.coverage.toFixed(2)} ${top ? `${top.passage.file}:${top.passage.startLine}` : ""}` +
        (r.unknownTerms.length ? ` unknown=[${r.unknownTerms.join(",")}]` : "")
    );
  }
  console.log(`  hit@3 ${hits}/${answerable}`);
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
