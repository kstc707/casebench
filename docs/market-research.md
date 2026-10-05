# Is anyone doing this? An honest assessment (October 2026)

## Short answer

**Yes — the core idea is already a crowded market.** "Work a simulated job with an AI manager and
AI teammates" exists as several funded products. Casebench is **not** a novel product idea. It
**is** a strong, credible portfolio project, *if* it's deployed, used by real people, and its AI
behaviour is measured. Treat it as proof of skill, not as a startup.

## Who's already doing it

| Product | What it does | Overlap with Casebench |
|---|---|---|
| **SIMU** (simuai.io) | Simulated workdays at a fictional company with tickets, an AI manager, standups, AI teammates, deadlines; has a data-analytics track | Very high — nearly the same pitch |
| **JobSim** (jobsim.work) | Simulations in the browser *or Slack*, 3+ AI stakeholders acting independently with competing demands | Very high — Slack, multiple autonomous agents |
| **Anthropos** | 30–45 min simulations with voice, chat, code, and documents; AI actors as colleagues and clients; sold to employers | High (B2B assessment) |
| **CareerCracker Job Simulator** | Generates a new scenario for any role on demand; AI plays colleagues, customers, execs; a hiring manager grades your shift | High (breadth over depth) |
| **CareerSimulator, OneRoadmap** | Job simulations including data analytics; AI-reviewed feedback, certificates | Medium |
| **Forage** | 250+ free employer-branded simulations (now including GenAI data-analytics tracks) | Medium — the distribution giant |
| **CodeSignal, TestGorilla, HackerRank** | Employer assessments adding AI role-play, "agentic assessments", immersive simulations | Medium — B2B hiring side |

## Where Casebench is genuinely different

Not "AI coworkers" — everyone has that. These are the defensible differences:

1. **A verified answer key.** Competitors that generate scenarios on the fly can't know what's
   actually true in their data, so they grade plausibility. Casebench plants measured effects in
   seeded data, proves them with tests, and grades against the measured facts.
2. **Agents that watch the actual work.** Coworkers react to the SQL you run (the event log),
   not just to chat. The grader sees the query log and can tell real analysis from confident
   guessing.
3. **Knowledge split across agents.** The manager doesn't know about the logging bug; the data
   engineer does. You have to ask the right person — a realistic skill most sims don't test.
4. **Measured agent safety.** A leak guard plus an adversarial eval with a reported leak rate.
5. **Open source, inspectable.** Every design decision is documented in the build log.

## How credible is it as a portfolio project?

**Strong — with conditions.** Entry-level hiring guidance in 2026 consistently asks for (a) an
LLM-powered, *deployed* application and (b) an evaluation of AI output. Casebench covers both,
plus data work (synthetic data with planted effects, SQL, segmentation) that matches data-analyst
roles. It's also a far better interview story than another dashboard or Kaggle notebook.

It becomes **weak** if:

- it's not live (a GitHub link alone is easy to ignore);
- you can't explain the code without notes — interviewers will probe the event log, the trigger
  engine, the leak guard, and why DuckDB;
- the agent eval has never been run (claims about "leak-proof agents" with no numbers);
- you call it a startup with zero users.

## How useful would it be if launched?

Honestly: **niche**. Job seekers mostly practice with free tools (Forage, LeetCode, YouTube), and
the paid market is moving to employers (assessments), where sales cycles are long. Realistic
paths:

- **Portfolio + small community launch** (recommended): deploy, get 20–50 real users (classmates,
  r/dataanalysis, LinkedIn), publish what you learn — e.g. "68% of users never deduplicated the
  sessions table". That *usage data* is the most impressive thing you can show.
- **Teaching tool**: university data-analytics courses need realistic, gradable cases. Your TA
  experience is a real angle — a pilot with one course is more credible than a consumer launch.
- **Startup**: only with a sharp wedge (e.g. "verified-answer-key cases for bootcamps") and
  distribution. Not recommended as the primary goal.

## What to do next to maximise credibility

1. Deploy (see `docs/deploy.md`) and run the agent eval with a real key; commit the report.
2. Get 10–20 people to do the case; add a small analytics view of how people approach it.
3. Write one short post: "What 20 analysts did when the data lied to them".
4. Add a second case using the same engine, to prove the content-as-data claim.

## Sources

- [The Complete Guide to AI Job Simulations — Cangrade](https://www.cangrade.com/blog/talent-acquisition/the-complete-guide-to-ai-job-simulations/)
- [SIMU — Prepare for your dream tech job with AI simulations](https://www.simuai.io/)
- [JobSim](https://www.jobsim.work/)
- [Anthropos — AI Job Simulations](https://anthropos.work/product/job-simulations/)
- [CareerCracker — Job Simulator](https://www.careercracker.com/job-simulator)
- [CareerSimulator](https://www.careersimulator.com/)
- [OneRoadmap — Data Analyst Job Simulation](https://www.oneroadmap.io/job-simulation/data-analyst)
- [Forage — Tata GenAI Powered Data Analytics](https://www.theforage.com/simulations/tata/data-analytics-t3zr)
- [CodeSignal — Agentic AI Assessments](https://codesignal.com/agentic-assessments/)
- [TestGorilla — Immersive Job Simulations](https://support.testgorilla.com/hc/en-us/articles/46448569600411-Introducing-Immersive-Job-Simulations)
- [Dataquest — AI projects for your portfolio (2026)](https://www.dataquest.io/blog/ai-projects/)
- [Upskillist — AI portfolio examples that impress recruiters (2026)](https://www.upskillist.com/blog/10-ai-portfolio-examples-impress-recruiters/)
