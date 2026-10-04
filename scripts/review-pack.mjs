// Bundles the project into ONE markdown file for an outside reviewer (a person,
// or an AI chat like ChatGPT/Gemini/Claude that can't browse the whole repo).
//
//   node scripts/review-pack.mjs [out.md] [--lite]   (default: review-pack.md, gitignored)
//   --lite: docs + file tree only (~1/4 the size), for chats with small upload limits
//
// Order: review prompt → README → how it works → research → build log → file
// tree → source. Large generated data (CSVs, lockfile, prototype) is left out.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const lite = process.argv.includes("--lite");
const out = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "review-pack.md";
const files = execSync("git ls-files", { encoding: "utf-8" }).trim().split("\n");

const skip = (f) =>
  /(^|\/)(pnpm-lock\.yaml|LICENSE)$/.test(f) ||
  f.endsWith(".csv") ||
  f.startsWith("prototype/") ||
  f.startsWith(".github/ISSUE_TEMPLATE") ||
  /analysis\.json$/.test(f);

const docsFirst = [
  "README.md",
  "docs/how-the-backend-works.md",
  "docs/market-research.md",
  "docs/authoring-scenarios.md",
  "docs/deploy.md",
  "docs/roadmap.md",
  ...files.filter((f) => f.startsWith("docs/build-log/")).sort(),
];
const code = files.filter(
  (f) => !skip(f) && !docsFirst.includes(f) && /\.(ts|tsx|mjs|js|sql|json|css|yml|md)$/.test(f) && !f.startsWith("docs/")
);
const lang = (f) => ({ ts: "ts", tsx: "tsx", mjs: "js", js: "js", sql: "sql", json: "json", css: "css", yml: "yaml", md: "markdown" })[f.split(".").pop()] ?? "";

const PROMPT = `# Casebench — review pack

You are reviewing **Casebench**, a project by a recent data-science master's graduate who is job-hunting
(data analyst / data scientist / AI engineering roles) and wondering whether it could become a startup.
It was built with an AI coding assistant (Claude Code), directed and reviewed by the author.

This file contains the docs, a file tree, and all source code (large data files omitted).
Please give a **candid, specific** review — not encouragement. Cite file paths for code claims, and say
"not in this file" rather than guessing about anything you can't see.

1. **Product & market:** Is this a real problem? How does it compare to SIMU, JobSim, Anthropos, Forage,
   CodeSignal simulations? What is genuinely differentiated, and what is not?
2. **Startup potential:** Who would pay (job seekers, universities/bootcamps, employers)? What would you
   need to see in 90 days to believe it's a company? What would make you walk away?
3. **Hiring signal:** As a hiring manager for (a) data analyst, (b) data scientist, (c) AI/ML engineer roles,
   how would this project read on a resume? What would you probe in an interview?
4. **Architecture & code quality:** Strengths, weaknesses, over-engineering, missing pieces.
5. **AI agent design:** Are the trigger engine, hint levels, leak guard, and grader sound? How would you
   attack them (prompt injection, answer leakage, grader gaming)?
6. **Security & reliability:** Anything that must be fixed before sharing a public link?
7. **Top 5 next steps**, in priority order, each with why.

---
`;

let md = PROMPT;
for (const f of docsFirst.filter((f) => files.includes(f))) {
  md += `\n\n<!-- FILE: ${f} -->\n\n${readFileSync(f, "utf-8")}\n`;
}
md += `\n\n---\n\n# File tree\n\n\`\`\`\n${files.filter((f) => !f.startsWith(".github/ISSUE")).join("\n")}\n\`\`\`\n\n# Source code\n`;
if (lite) md += "\n_Lite pack: source code omitted. Base code claims only on the docs above._\n";
for (const f of lite ? [] : code) {
  md += `\n## \`${f}\`\n\n\`\`\`${lang(f)}\n${readFileSync(f, "utf-8").trimEnd()}\n\`\`\`\n`;
}
writeFileSync(out, md);
console.log(`wrote ${out}: ${(md.length / 1024).toFixed(0)} KB, ~${Math.round(md.length / 4 / 1000)}k tokens, ${code.length} source files`);
