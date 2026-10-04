import { describe, expect, it } from "vitest";
import type { AgentPersona, AgentTrigger, LeakGuard, Rubric, RunEvent, SimulationAgent } from "@casebench/domain";
import { MockAIProvider } from "@casebench/ai";
import { dueTriggers } from "./triggers";
import { currentHintLevel } from "./hints";
import { applyLeakGuards } from "./guard";
import { generateAgentMessage, replyInstruction } from "./respond";
import { evaluateSubmission, heuristicEvaluation, parseSubmission, weightedScore } from "./evaluator";
import { summarizeActivity } from "./activity";

const T0 = Date.parse("2026-09-01T10:00:00Z");
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const start: RunEvent = { type: "run_started", at: at(0), problemSlug: "p", userId: "u" };
const query = (min: number, sql: string): RunEvent => ({ type: "query_run", at: at(min), sql, rowCount: 10, error: null });
const sent = (min: number, channel: string, text: string): RunEvent => ({ type: "message_sent", at: at(min), channel, text });
const fired = (min: number, trigger: string): RunEvent => ({ type: "message_received", at: at(min), channel: "priya", text: "x", trigger });
const now = (min: number) => T0 + min * 60_000;

const triggers: AgentTrigger[] = [
  { id: "kickoff", personaId: "priya", when: { type: "run_started" }, text: "hi" },
  { id: "sessions", personaId: "sam", when: { type: "query_matches", pattern: "\\bsessions\\b", atLeast: 1 }, text: "hey" },
  { id: "checkin", personaId: "priya", when: { type: "query_count", atLeast: 3 }, notBeforeMinutes: 8, prompt: "check in" },
  { id: "idle", personaId: "priya", when: { type: "idle", minutes: 10 }, notBeforeMinutes: 5, prompt: "nudge" },
  { id: "pressure", personaId: "priya", when: { type: "minutes_elapsed", atLeast: 30 }, prompt: "status?" },
];
const ids = (ts: AgentTrigger[]) => ts.map((t) => t.id);

describe("dueTriggers", () => {
  it("fires the kickoff once, and only once", () => {
    expect(ids(dueTriggers(triggers, [start], now(0)))).toEqual(["kickoff"]);
    expect(ids(dueTriggers(triggers, [start, fired(0, "kickoff")], now(1)))).toEqual([]);
  });

  it("reacts to what the user queries", () => {
    const events = [start, fired(0, "kickoff"), query(1, "select * from users")];
    expect(ids(dueTriggers(triggers, events, now(1)))).toEqual([]);
    events.push(query(2, "select count(*) from sessions"));
    expect(ids(dueTriggers(triggers, events, now(2)))).toEqual(["sessions"]);
  });

  it("respects notBeforeMinutes", () => {
    const events = [start, fired(0, "kickoff"), fired(1, "sessions"), query(1, "a"), query(2, "b"), query(3, "c")];
    expect(ids(dueTriggers(triggers, events, now(4)))).toEqual([]);
    expect(ids(dueTriggers(triggers, events, now(9)))).toEqual(["checkin"]);
  });

  it("notices when the user goes quiet, and when time runs on", () => {
    const events = [start, fired(0, "kickoff"), query(1, "select 1")];
    expect(ids(dueTriggers(triggers, events, now(10)))).toEqual([]);
    expect(ids(dueTriggers(triggers, events, now(12)))).toEqual(["idle"]);
    expect(ids(dueTriggers(triggers, [...events, fired(12, "idle")], now(31)))).toEqual(["pressure"]);
  });

  it("goes quiet after submission (except event triggers)", () => {
    const events: RunEvent[] = [start, fired(0, "kickoff"), query(1, "select 1"), { type: "submission_finalized", at: at(2), submission: {} }];
    expect(ids(dueTriggers(triggers, events, now(45)))).toEqual([]);
  });
});

const agent: SimulationAgent = {
  personaId: "priya",
  knowledge: ["The campaign started Aug 3."],
  hintLevels: [
    { level: 1, unlockAfterMinutes: 20, unlockAfterUserMessages: 3, description: "suggest dimensions" },
    { level: 2, unlockAfterMinutes: 40, description: "confirm hypotheses" },
  ],
  mustNot: ["Reveal grading"],
};

describe("currentHintLevel", () => {
  it("starts at 0 and unlocks by time or by questions asked", () => {
    expect(currentHintLevel(agent, [start], now(5))).toBe(0);
    expect(currentHintLevel(agent, [start], now(21))).toBe(1);
    expect(currentHintLevel(agent, [start, sent(1, "priya", "a"), sent(2, "priya", "b"), sent(3, "priya", "c")], now(4))).toBe(1);
    expect(currentHintLevel(agent, [start], now(41))).toBe(2);
  });

  it("only counts questions asked to this agent", () => {
    const events = [start, sent(1, "sam", "a"), sent(2, "sam", "b"), sent(3, "sam", "c")];
    expect(currentHintLevel(agent, events, now(4))).toBe(0);
  });
});

const guards: LeakGuard[] = [
  { personaId: "priya", pattern: "campaign.{0,40}(caus|driv)", unlessUserSaid: "campaign|acquisition", replacement: "What do you see?" },
  { personaId: "*", pattern: "duplicat", unlessUserSaid: "duplicat|mobile", replacement: "Look at the rows." },
];

describe("applyLeakGuards", () => {
  it("blocks an unprompted give-away", () => {
    const r = applyLeakGuards("Honestly the campaign is driving it.", guards, "priya", ["what's going on?"]);
    expect(r).toEqual({ text: "What do you see?", blocked: true });
  });

  it("allows it once the user raised the topic themselves", () => {
    const r = applyLeakGuards("Yes, the campaign is driving part of it.", guards, "priya", ["is the campaign mix dragging the average?"]);
    expect(r.blocked).toBe(false);
  });

  it("applies wildcard guards to every agent, and ignores other agents' guards", () => {
    expect(applyLeakGuards("there are duplicates", guards, "sam", []).blocked).toBe(true);
    expect(applyLeakGuards("campaign is driving it", guards, "sam", []).blocked).toBe(false);
  });
});

const persona: AgentPersona = {
  id: "priya", name: "Priya Nandan", title: "Head of Analytics", company: "StreamWave",
  role: "manager", tone: "Warm.", avatarColor: "#000", offlineReply: "offline",
};

describe("generateAgentMessage", () => {
  it("gives the model knowledge in the system prompt and live context in the user turn", async () => {
    const provider = new MockAIProvider();
    const events = [start, query(2, "select * from sessions"), sent(3, "priya", "where should I start?")];
    await generateAgentMessage({
      provider, persona, agent, guards, events, now: now(4),
      problem: { title: "Why?", brief: "Watch time is down.", managerName: "Priya" },
      instruction: replyInstruction("where should I start?"),
      mock: "Start with the metric definition.",
    });
    const call = provider.calls[0] as { system: string; user: string; model: string };
    expect(call.system).toContain("The campaign started Aug 3.");
    expect(call.system).toContain("Reveal grading");
    expect(call.user).toContain("Hint level allowed right now: 0.");
    expect(call.user).toContain("select * from sessions");
    expect(call.user).toContain("You (new teammate): where should I start?");
    expect(call.model).toBe("claude-haiku-4-5");
  });

  it("runs the reply through the leak guard", async () => {
    const result = await generateAgentMessage({
      provider: new MockAIProvider(), persona, agent, guards, events: [start], now: now(1),
      problem: { title: "Why?", brief: "b", managerName: "Priya" },
      instruction: "say something", mock: "The campaign is driving the whole thing.",
    });
    expect(result).toEqual({ text: "What do you see?", blocked: true });
  });

  it("counts a SQL query as the user raising a topic", async () => {
    const result = await generateAgentMessage({
      provider: new MockAIProvider(), persona: { ...persona, id: "sam" }, agent: { ...agent, personaId: "sam" }, guards,
      events: [start, query(1, "select * from sessions where device = 'mobile'")], now: now(2),
      problem: { title: "Why?", brief: "b", managerName: "Priya" },
      instruction: "reply", mock: "yeah, those duplicates are from the old app",
    });
    expect(result.blocked).toBe(false);
  });
});

const rubric: Rubric = {
  problemSlug: "p",
  scale: { min: 0, max: 4 },
  criteria: [
    { key: "data_quality", label: "DQ", description: "", weight: 0.75, weak: "", strong: "", offlineKeywords: ["duplicat|dedup", "5\\.2|mobile"] },
    { key: "communication", label: "Comms", description: "", weight: 0.25, weak: "", strong: "" },
  ],
};

describe("evaluation", () => {
  it("computes the weighted score in code, not by the model", () => {
    const score = weightedScore(rubric, {
      criteria: [{ key: "data_quality", score: 4, justification: "" }, { key: "communication", score: 2, justification: "" }],
      strengths: [], improvements: [], overallFeedback: "",
    });
    expect(score).toBe(88); // 0.75*1 + 0.25*0.5 = 0.875
  });

  it("offline heuristic rewards the right ideas and is labelled as offline", async () => {
    const strong = {
      executiveSummary: "Most of the drop is a measurement artifact from duplicate mobile events in app 5.2, plus a mix shift from the paid_social campaign cohort.",
      evidence: "Deduplicated sessions; segmented by cohort and experiment arm.",
      caveats: "Experiment effect estimated from TV sessions only.",
      recommendation: "Data eng should dedupe; analytics owns cohort reporting.",
    };
    const result = await evaluateSubmission({
      provider: new MockAIProvider(), rubric, truth: {}, analysis: {}, submission: strong, events: [start],
    });
    expect(result.gradedBy).toBe("offline-heuristic");
    expect(result.criteria.find((c) => c.key === "data_quality")?.score).toBe(4);

    const weak = heuristicEvaluation(rubric, { executiveSummary: "Engagement is down.", evidence: "", caveats: "", recommendation: "Improve engagement." });
    expect(weak.criteria.find((c) => c.key === "data_quality")?.score).toBe(0);
    // No keywords (communication here): scored on effort only.
    expect(weak.criteria.find((c) => c.key === "communication")?.score).toBe(0);
    expect(heuristicEvaluation(rubric, { a: "x".repeat(150) }).criteria.find((c) => c.key === "communication")?.score).toBe(2);
  });
});

describe("summarizeActivity", () => {
  it("reports only what's in the log", () => {
    const text = summarizeActivity([start, query(3, "select * from users join experiments using (user_id)")], now(5));
    expect(text).toContain("Queries run: 1");
    expect(text).toContain("Tables queried: users, experiments");
    expect(summarizeActivity([start, query(1, "WITH s AS (SELECT * FROM funnel) SELECT * FROM s")], now(2))).toContain("Tables queried: funnel, s");
    expect(text).toContain("Write-up: not started");
  });
});

describe("parseSubmission", () => {
  const sections = [
    { key: "insight", label: "Key insight", hint: "", required: true },
    { key: "design", label: "Proposed design", hint: "" },
  ];
  it("keeps only the problem's own sections and enforces required ones", () => {
    const ok = parseSubmission({ insight: " Users miss the trial option ", design: "Move it up", extra: "ignored" }, sections);
    expect(ok).toEqual({ ok: true, submission: { insight: "Users miss the trial option", design: "Move it up" } });
    expect(parseSubmission({ design: "x" }, sections)).toEqual({ ok: false, error: "Key insight is required" });
    expect(parseSubmission({ insight: 5 }, sections).ok).toBe(false);
  });
});

