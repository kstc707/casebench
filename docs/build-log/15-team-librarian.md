# 15 — The team librarian: search the team's notes, with citations and honest labels

## Goal

Give the dev team (and the owner) a way to **ask the team's own notes a question** and get back the
passages that come closest, each with a `file:line` citation. This is section 1 of the "librarian":
keyword search only, no AI model. It must never pretend to know the answer, and it must never hide a
real one.

The idea came from the owner: link each agent's notes to a smaller model, updated every day, that agents
can question. The team lead recommended a different route (see the first decision below), the owner
approved it, and the team built it through the `/rpi` process in one morning (Oct 11, 2026).

## Where we started

- The team's memory is plain markdown: `.claude/team/**` (decisions, lessons, glossary, journal, chats)
  and `docs/build-log/**`. The researcher measured it at about **31 files, ~117 KB**.
- To find a past decision, an agent had to open files and read them, or ask the owner.
- Nothing measured whether a search over these notes would even work.

## What we built

A new package, `packages/team-memory`, and one root command, `pnpm team:ask`.

| File | What it does |
|---|---|
| `packages/team-memory/src/corpus.ts` | Reads every `.md` file in the two memory folders and splits it into **passages** (small chunks). Each passage keeps its file and its first and last line, so a result can cite `file:line`. |
| `packages/team-memory/src/search.ts` | Ranks passages for a question with **BM25** (written by hand), a light **stemmer**, **synonyms** and query **concepts**; then labels the result "closest" or "nothing related". |
| `packages/team-memory/src/synonyms.ts` | A short, hand-kept list of word groups that should find each other (6 groups today). |
| `packages/team-memory/src/args.ts` | Parses `"question" [--limit N] [--json]`. Pure, so it is tested without running anything. |
| `packages/team-memory/src/format.ts` | The wording people and agents see: the header, the citations, excerpts with real line numbers, the warning, the JSON shape. |
| `packages/team-memory/src/ask.ts` | The command itself: a thin wrapper that wires args → corpus → search → format, and sets the exit code. |
| `packages/team-memory/src/golden.ts` | Loads the question sets, searches each question, and scores the result. Shared by the CI test and the eval script, so their numbers can't drift apart. |
| `packages/team-memory/src/golden.test.ts` | The **golden tests**: hard rules plus ranking floors, run in CI with every `pnpm test`. |
| `packages/team-memory/eval/calibration.json`, `eval/heldout.json` | The question sets. Each answerable question names its expected passage by **file + a short quote**, not by line numbers (line numbers move whenever someone adds a note above). |
| `packages/team-memory/eval/run.ts` | `pnpm --filter @casebench/team-memory eval`: prints every question's label and rank, plus hit@3 and MRR per set. |
| `package.json` (root) | `"team:ask": "tsx packages/team-memory/src/ask.ts"`. Runs `tsx` directly so `--json` output is clean. |
| `.claude/team/README.md` | Tells agents to run `pnpm team:ask` before asking the owner about past decisions. |

Unit tests sit next to each file (`corpus.test.ts`, `search.test.ts`, `format.test.ts`, `ask.test.ts`).

### How a passage is made (`corpus.ts`)

A new passage starts at each heading, after each blank line, and at each top-level bullet (`- …` or
`1. …` in the first column). Each table row is its own passage. Fenced code blocks stay whole, so a
`# comment` inside one isn't read as a heading. Splitting at bullets mattered: a lessons file is one long
bullet list, and without it the whole file was one passage.

`loadCorpus` **throws** if it finds no markdown at all. An empty memory would make every answer "nothing
related", which looks like a normal result but is really a broken setup.

### How ranking works (`search.ts`), for a data-analysis reader

BM25 is the classic search-engine scoring formula. For each word of the question it asks three things
about a passage, then adds the answers up:

1. **Term frequency: does the passage use the word, and how often?** More uses score higher, but with
   diminishing returns. The knob `k1 = 1.2` sets how fast repeats stop counting, so a passage can't win
   by saying "Slack" ten times.
2. **Rarity (idf, inverse document frequency): how unusual is the word across all passages?** A word
   found in almost every passage ("team") tells you little; a rare one ("pyodide") tells you a lot. The
   code uses `idf = ln(1 + (N − df + 0.5) / (df + 0.5))`, where `N` is the number of passages and `df` the
   number that contain the word. Think of it as a weight, like down-weighting a feature that is the same
   for every row.
3. **Length normalisation: how long is the passage?** One matching word in a two-line bullet counts for
   more than the same word in a 40-line block. The knob `b = 0.75` sets how strongly long passages are
   penalised (0 = not at all, 1 = fully).

Before counting, every word is lowercased, common words ("the", "and", "is") are dropped, and word
endings are trimmed by a small **stemmer** ("crashes", "crashed", "crash" → one term). A short
exceptions list fixes words the rules get wrong ("used" must not become "us").

Two additions on top of plain BM25:

- **Synonyms.** Keyword search only finds the words you type. The risk check missed answers because the
  notes said "infinite loop" and the question said "endless loop", or "fake" vs "cheat". `synonyms.ts`
  holds 6 small groups. A synonym match counts 0.8 of a typed word, and uses the **lower** of the two
  words' rarity, so a rare synonym can't outrank the word you actually typed. The rule for adding a group:
  a real question missed because of it, and one of the words really appears in the notes.
- **Concepts.** One idea in the question counts once. "Slack-style … Slack" is one idea, not two; a
  word plus its synonym is one idea; a full file path also matches
  a passage that only names the file. Ideas are merged with a small union-find (a standard
  way to group items that are "the same" step by step). Two different file names that only share `.ts`
  stay separate.

### The label: "closest" or "nothing related"

| Situation | Label | What `team:ask` prints |
|---|---|---|
| At least one word of the question (or a synonym) appears in some passage | `closest` | "Closest passages in the team's notes — check whether they answer your question:" then the top 3 with citations |
| …and most of the question's weight is words the notes never use (known share < 0.5) | `closest` + `lowOverlap` | Also a warning naming those words: "The passages may be unrelated." |
| No word of the question appears anywhere | `nothing related` | "Nothing related found in the team's notes" |

"Known share" is the share of the question's weight (rarer words weigh more) made of words that exist
somewhere in the notes. It only adds a warning; it never hides passages. The footer always says:
"Keyword search only — it finds passages, it doesn't decide the answer."

### The command (`ask.ts`)

```bash
pnpm team:ask "why Pyodide in the browser"          # for people
pnpm -s team:ask "why Pyodide in the browser" --json # for agents
```

- Output shows the passage's **own text**, with real line numbers, picking the lines that hold the
  matched words. You can open the file at that line and see the same text.
- `--json` returns `label`, `lowOverlap`, `unknownTerms`, `truncated` and `results` (file, lines,
  heading, score, excerpt). With `--json`, stdout is always JSON, even for an error
  (`{"error", "exitCode"}`).
- Exit codes: **0** passages shown, **1** nothing related, **2** usage error, **3** no memory found.
  Caveat: with `pnpm -s` (silent, needed for clean JSON) pnpm reports **every** failure as exit 1. So
  agents should read `label` (or `exitCode` in an error) from the JSON, not the process exit code.
- Questions longer than 2,000 characters are cut, and the output says so.

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| **Retrieval over retraining.** Search the files the owner already owns, and cite them. | Inspectable (every result points at a line you can read), undoable (delete a note and it's gone), and the files stay the single source of truth. The team lead mapped it to known patterns: RAG, Reflexion, Generative Agents' memory stream, MemGPT, model cascades. | The owner's first idea: a small model, updated daily, trained on the notes. You can't see what it learned, can't cleanly remove a wrong lesson, and it costs a training run per day. |
| **Section 1 is search only, no AI model.** | Too much to review at once otherwise. An AI answer step (it must quote passages word for word, and code checks each quote exists) is section 2. | Building search and the AI step together. |
| **Hand-written BM25**, not a library. | Every number can be explained in an interview. At ~117 KB of notes, nothing faster is needed. | MiniSearch (MIT, maintained): it fixes word endings, not synonyms. Embeddings (vector search): not needed at this size. |
| **A small, hand-kept synonym list** with a written rule for adding groups. | It fixed real misses from the risk check. Broad groups ("run = execute = start") would match many unrelated passages. | No synonyms; or a big thesaurus. |
| **Labels changed twice** (see Problems). Final rule: "nothing related" **only** when nothing matches at all; otherwise "closest", with a warning when many words are unknown. | Owner's rule: hiding a real answer is the worst failure. Keyword overlap measures **topic, not answers**, so no score can honestly say "this is the answer". | 1st: "strong match / weak match / not found". 2nd: two labels decided by a known-share cut of 0.5. |
| **Only ratios, never an absolute score**, in any rule. | BM25 scores grow with the size of the memory (idf grows with the log of the passage count), so a fixed score floor drifts as notes are added. | The first version's "score ≥ 12" condition for "strong". |
| **Table rows are separate passages.** | A fact in one row of a long build-log table was buried by the length penalty. | Keep tables whole (cost: 2 calibration answers slipped from rank 1 to rank 2; accepted). |
| **Questions anchored by quote, not line number.** | Line numbers move; a quote that vanishes is reported as "stale", so the set can't silently rot. | Fixed line ranges. |
| **Two question sets: calibration and held-out.** | The warning line (0.5) was chosen on calibration only; held-out is only measured, so its numbers show how search does on questions it wasn't tuned on. | One set used for both tuning and reporting (it would flatter the numbers). |
| **The eval index leaves out the journal** (`.claude/team/journal/`). Production search still includes it. | The journal records the eval runs and quoted test questions; a note that quotes a question matches every word of it and crowds out the real answer. | Indexing everything (it was already changing eval results). |
| **The model for section 2 is Gemini Flash-Lite on the free tier**; the nightly journal job opens a PR. | Owner's choice. Trade-off accepted: on the free tier Google may use the prompts (team notes) to improve its products. | Paid Claude Haiku 5.5, which the planner recommended for privacy. |

## Problems found along the way

This section is the most useful part for an interview. It ran as: risk check → owner decision →
engineer / reviewer / tester rounds, step by step. All numbers are from the build journal
(`.claude/team/journal/2026-10-11.md`).

### 1. The risk check changed what we could promise

Before writing the package, the engineer tested the idea on paraphrased questions. The best variant
(split at bullets + stemming) found the right passage in the top 3 for **10/14** (the bar was ~9/12).
But the score couldn't say "not found": an on-topic question with **no** answer scored **15.5**, above
**13/14** questions that did have one. The misses were vocabulary: endless vs infinite, cheat vs fake,
conversation vs chat. The engineer also had to fix 5 of its own expected line ranges, read wrongly from
concatenated output.

Because this changed what section 1 could promise, it went back to the owner, who chose synonyms plus
three labels (strong / weak / not found), and moved a reliable "not found" to section 2.

### 2. Step 2 (passages): two silent failures

The reviewer probed and found: a wrong root or missing folders made `loadCorpus` return an empty list
silently (every answer would be "not found"); and one unclosed or inline code fence hid every later
heading and could push a citation past the end of the file. Fixed: an empty corpus throws; inline
triple backticks are ignored; an unclosed fence is plain text; `endLine` never passes the end of the
file. 16 tests passed; the reviewer re-ran its probes and approved.

### 3. Step 3 (search): "strong" was dishonest, and tuning couldn't fix it

The first search used coverage cut-offs (below 0.30 → not found; "strong" needed coverage ≥ 0.50 and score
≥ 12). On the engineer's own questions it looked good: hit@3 **11/14**, 0 wrong "strong".

Then the tester wrote **22 unseen questions**. Ranking held up (hit@3 **13/16 = 81%**, vs 79% on the
spike, so not over-fitted). But:

- **Near-miss questions were labelled "strong".** A near-miss is on-topic but asks for a detail the notes
  don't have (the sidebar's exact hex colour, the pinned Playwright version, a paid-plan rate limit). The
  passage shared the words but lacked the fact.
- **4/16 real answers were hidden** as "not found" (3 of them were at rank 1–3).
- Hyphenated words counted 3–4 times ("Slack-style" → strong, "Slack" → not found).

The reviewer separately found that a word plus its synonym was double-counted, and a rare synonym could
outrank the typed word.

The team lead's conclusion from both: **keyword coverage measures topic overlap, not whether the fact is
there.** Back to the owner, who replaced the three labels with two: "closest passages: check them" and
"nothing related". The earlier decision is marked *Replaced* in `decisions.md`.

### 4. The two-label version still hid real answers

The fix round decided "nothing related" by **known share < 0.5**. Held-out looked fixed (answerable
hidden **0/16**, was 4/16). The tester then tried short, casual questions with one word our notes never
use, and a **correct rank-1 passage was hidden** as "nothing related". The reason: a word found nowhere
gets the highest rarity weight, so one unknown slang word drags a short question below any cut. On a
fresh 10-question set, hit@3 was **2/6**: the truest unseen number so far, and a vocabulary gap, not a
ranking bug.

The reviewer meanwhile found the concept fix had pushed the passage naming an exact file from
rank 2 to 4 (the tests only checked rank 1).

The team lead applied the owner's rule directly: **say "nothing related" only when no word matches at
all; otherwise show the passages, with a warning.** After that round: answerable questions hidden **0**
on both sets; off-topic questions all shown, 5/7 with a warning (accepted trade-off).

### 5. Final rounds of step 3

The tester confirmed **0/62** answerable questions hidden across 4 sets plus casual probes, and hit@3
**7/8** on a new casual set kept out of the memory. Remaining: **3/9** off-topic questions shown with
no warning (accepted: the CLI wording carries the honesty), and long queries ~10× slower. The last
round: union-find merging, path → file name (rank 18 → 9, partly fixed), a 2,000-character cap
(worst case **1.2 s → 4 ms**), and the journal left out of the eval index. Eval then: calibration
hit@3 **10/14**, held-out **13/16**. The team lead widened a speed-test bound from 100 to 1000 ms (82 ms
locally; 100 would flake on CI and 1000 still catches the old 1.2 s case) and **stopped polishing on
purpose** after 4 rounds: diminishing returns.

### 6. Step 4 (the command): the documented command didn't work

Both the reviewer and the tester hit the same **blocker**: `pnpm team:ask … --json` printed pnpm's own
"> script" banner before the JSON, so an agent couldn't parse it. The package tests passed, because they
never ran the documented command. Fixed: the root script runs `tsx` directly, agents use `pnpm -s`, and
`ask.test.ts` now **spawns the real command and parses its output**.

On exit codes the engineer and tester disagreed (the engineer said pnpm 9 turns every non-zero code
into 1; the tester saw codes pass through on pnpm 9.0.0). Final finding: without `-s` they pass through;
with `-s` every failure becomes 1. So the JSON is the source of truth.

Also fixed: excerpts always showed a passage's first 3 lines (now the lines with the matched words); a
leading `--` turned later flags into question text; facts inside long tables were buried. Splitting
table rows took the memory from **680 to 989** passages; calibration rank-1 hits went **8 → 6** while
hit@3 stayed the same (10/14, 13/16).

### 7. Step 5 (golden tests): what the tests didn't catch

- The reviewer simulated a future build log that **quotes eval questions**, and held-out fell below its
  floor with a confusing message. (This very document is that build log; see "How it was verified".)
  Fixed: a **contamination check** that fails naming the file and line.
- The tester showed one plausible new lesson bullet pushed held-out to **exactly** its floor. Fixed:
  floors set two below today, plus an MRR floor.
- **Mutation testing** (deliberately breaking the code to see if a test notices, done in a copy of the
  repo): an empty synonym list, no stemming, idf switched off, off-by-one line numbers and "always
  closest" were caught. Two were **not**: BM25's `b = 1.0` (a different tuning, not clearly worse, now
  documented), and **re-adding the old "hide on low overlap" rule** (the golden sets had no casual
  questions). Fixed: 4 casual held-out questions (A17–A20), so that rule now fails the golden test.
- The team lead's own check: a step-4 test failed under `pnpm -s test`, because pnpm leaks
  `npm_config_reporter=silent` into the child process. CI's `pnpm test` was green. Fixed the test's
  environment; both `pnpm test` and `pnpm -s test` gave **365** passing tests. Lesson recorded: run the
  full suite both ways.

## How it was verified

- **Unit tests** next to each file: passage splitting (fences, tables, CRLF, end of file), the stemmer,
  BM25 maths, concept merging, synonyms, argument parsing, wording and JSON shape. `ask.test.ts` runs the
  real documented command.
- **Whole-memory citation test:** every passage's text must equal the exact file lines it cites. The
  reviewer's check found 0 mismatches over 991 passages; the tester checked 40/40 citations byte for byte
  against the files.
- **Golden tests** (`src/golden.test.ts`, 80 tests at step 5, about 0.6 s):
  - **Hard rules** (always true, however the notes grow): no answerable question is ever "nothing
    related"; every expected quote is still in its file; seeded random letters get "nothing related";
    every top-3 passage cites real lines; no eval question appears verbatim in the indexed notes.
  - **Soft floors** for ranking: hit@3 ≥ 8/14 (calibration) and ≥ 15/20 (held-out), MRR ≥ 0.50 for both.
    Floors are never lowered to let a change pass. If new notes trip one, first find which passage
    outranked the expected one.
  - **hit@3** = share of answerable questions whose expected passage is in the top 3. **MRR** (mean
    reciprocal rank) = average of 1/rank of the expected passage (1 at rank 1, 0.5 at rank 2, 0 if it
    never ranks); it shows a rank-1 → rank-2 slip that hit@3 hides.
- **Numbers at commit** (step 5): calibration hit@3 **10/14**, MRR **0.599**; held-out hit@3 **17/20**,
  MRR **0.640**.
- **After adding this build log** (it is now part of the searchable memory, 1062 passages in the eval
  index): calibration hit@3 **10/14**, MRR **0.596**; held-out hit@3 **17/20**, MRR **0.665**, the same as
  just before it was added. Only questions already outside the top 3 changed rank. To get there, two
  mentions of an exact file name were reworded: they had pushed the expected passage in a file-name
  ranking test from rank 3 to 4.

```bash
npx vitest run packages/team-memory               # unit + golden tests
pnpm --filter @casebench/team-memory eval         # per-question table, hit@3, MRR
pnpm team:ask "why Pyodide in the browser"
```

## Explain it in an interview

**Pitch (30 seconds):** "My AI dev team keeps its memory in markdown files: decisions, lessons, a build
journal. I added a librarian: a command that searches those files with BM25 and returns the closest
passages with file and line citations. It never claims to have the answer, because keyword overlap
measures topic, not answers; we proved that with near-miss questions. It's guarded by golden tests in CI
with hard rules and ranking floors, mutation-tested, and checked against contamination from its own
notes."

**Why not fine-tune a small model on the notes?** You can't inspect what it learned, can't cleanly
delete a wrong lesson, and you'd retrain daily. Retrieval keeps the files as the truth and every result
points to a line you can read.

**Why BM25 and not embeddings?** The memory is ~117 KB. BM25 is explainable term by term, has no model
or API key, and is deterministic. Its weakness is vocabulary (synonyms); we measured it (2/6 hit@3 on one
fresh unseen set) and patched the worst cases with a small synonym list. Section 2 can add more.

**Explain BM25 in one breath.** For each query word: how often it's in the passage (with diminishing
returns), times how rare it is across all passages, adjusted for passage length; sum over words.

**What was the hardest problem?** The label. We first had strong / weak / not found. An unseen test set
showed "strong" on questions whose passage was on-topic but lacked the fact, and real answers hidden as
"not found". No threshold separated them, because the score measures overlap. We changed the product
promise instead of tuning: show the closest passages, say "nothing related" only when nothing matches.

**How do you know the eval isn't flattering you?** A held-out set never used for tuning; floors that
can't be lowered; a contamination check; the journal excluded from the eval index because it quoted the
questions; and mutation tests to see which breakages the tests catch, including two they didn't.

**How did the team process help?** A risk check before building, and the owner deciding whenever a
result changed what we could promise (three times). The reviewer reads code and probes; the tester writes
unseen questions and drives the real command. They found different things: the reviewer found the
double-counting, the tester found the hidden answers, both found the broken `--json` command.

**What's not done?** No AI answer step yet (section 2), so the reader still judges each passage.
3/9 off-topic questions get passages with no warning. Long table rows carry no column names. `b = 1.0`
isn't caught by the golden test.

## Try it yourself

1. **Ask it something.** `pnpm team:ask "why Pyodide in the browser"`. Open the first citation in your
   editor at that line: the text should be identical.
2. **See "nothing related".** Ask a string of made-up letters with `--json`, e.g.
   `pnpm -s team:ask "qwzx plorbt" --json`. Check `label`, then run it without `-s` and compare `echo $?`.
3. **Watch a synonym work.** Ask about an "endless loop" in practice mode. Then remove the
   `["endless", "infinite"]` group from `packages/team-memory/src/synonyms.ts`, ask again, and compare
   the ranks. Run `pnpm --filter @casebench/team-memory eval` and see whether MRR moves. Undo the change.
4. **Feel the length penalty.** In `search.ts`, change `const B = 0.75` to `0` and re-run the eval. Which
   answers move up or down, and why? Undo.
5. **Trip the contamination check.** Copy one question's text from `eval/heldout.json` into a scratch
   `.md` file under `docs/build-log/`, run `npx vitest run packages/team-memory`, read the failure (it
   names file and line), then **delete the file**.
