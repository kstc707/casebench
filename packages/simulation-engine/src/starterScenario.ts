
import { DEFAULT_DELIVERABLE, type DeliverableSection } from "@casebench/domain";
import type { ScenarioBundle } from "./scenarioSchema";

/**
 * A complete, valid starter scenario for the Studio. Authors edit this
 * rather than starting from a blank page, so every scenario has sensible
 * coworkers, triggers, and a rubric from the first save.
 */

const UX_DELIVERABLE: DeliverableSection[] = [
  { key: "problemStatement", label: "Problem statement", hint: "Who is struggling to do what, where, since when.", rows: 3, required: true },
  { key: "findings", label: "Key findings & evidence", hint: "What's going wrong and how you know.", rows: 8, required: true },
  { key: "designProposal", label: "Design proposal", hint: "What you'd change and why. Add a Figma or sketch link if you have one.", rows: 8, required: true },
  { key: "successMetrics", label: "How we'll know it worked", hint: "Metric, target, guardrails.", rows: 4 },
];

const PM_DELIVERABLE: DeliverableSection[] = [
  { key: "decision", label: "Decision", hint: "What you recommend, in one or two sentences.", rows: 3, required: true },
  { key: "reasoning", label: "Reasoning & evidence", hint: "Why, with the evidence that supports it.", rows: 8, required: true },
  { key: "tradeoffs", label: "Trade-offs & risks", hint: "What we give up and what could go wrong.", rows: 4 },
  { key: "plan", label: "Plan & success metrics", hint: "Next steps, owners, and how we'll measure it.", rows: 5, required: true },
];

export function deliverableFor(role: string): DeliverableSection[] {
  if (role === "ux-designer") return UX_DELIVERABLE;
  if (role === "product-manager") return PM_DELIVERABLE;
  return DEFAULT_DELIVERABLE;
}

export function starterScenario(slug: string, role: string, title?: string): ScenarioBundle {
  return {
    problem: {
      type: "case-study",
      slug,
      role,
      company: "acme",
      companyName: "Acme",
      channel: "project",
      title: title?.trim() || "Untitled scenario",
      difficulty: "medium",
      estimatedMinutes: 60,
      concepts: [{ name: "Problem framing", blurb: "Work out what's really being asked before solving it." }],
      brief:
        "Describe the situation and the ask, in the manager's voice. What happened, why it matters, what you need from the new teammate, and by when.",
      resources: [{ title: "Background", content: "Context the person can read: notes, specs, research, tickets, numbers…" }],
      dataFiles: [],
      deliverable: deliverableFor(role),
      truthModel_INTERNAL_DO_NOT_EXPOSE_TO_USER:
        "The answer key. What is actually going on, the evidence that proves it, red herrings, and what a strong answer looks like. Only the grader ever sees this.",
    },
    personas: [
      {
        id: "manager",
        name: "Jordan Lee",
        title: "Team Lead",
        company: "Acme",
        role: "manager",
        tone: "Friendly, busy, direct. Short Slack messages.",
        avatarColor: "#7c3aed",
        offlineReply: "Good question — what have you found so far? (offline mode)",
      },
      {
        id: "colleague",
        name: "Sam Rivera",
        title: "Senior Colleague",
        company: "Acme",
        role: "colleague",
        tone: "Helpful about their own area, casual, a bit nerdy.",
        avatarColor: "#0891b2",
        offlineReply: "hmm, what are you seeing? (offline mode)",
      },
    ],
    agents: {
      agents: [
        {
          personaId: "manager",
          knowledge: ["The business context: goals, deadlines, what leadership is worried about."],
          hintLevels: [
            { level: 1, unlockAfterMinutes: 15, unlockAfterUserMessages: 3, description: "Suggest where to look, as a question, without saying what they'll find." },
            { level: 2, unlockAfterMinutes: 35, unlockAfterUserMessages: 6, description: "Confirm or push back on a specific hypothesis they state." },
          ],
          mustNot: ["Give away the answer.", "Reveal how the work will be graded."],
        },
        {
          personaId: "colleague",
          knowledge: ["A detail only they know, which the person must ask them about to find."],
          hintLevels: [{ level: 1, description: "If asked about their area, share what they know in general terms." }],
          mustNot: ["Do the work for them."],
        },
      ],
      triggers: [
        { id: "kickoff", personaId: "manager", when: { type: "run_started" }, text: "Hey, thanks for picking this up! The brief is pinned in the project channel. Ping me with questions." },
        { id: "colleague-hello", personaId: "colleague", when: { type: "minutes_elapsed", atLeast: 3 }, text: "hey! heard you're on the new project — shout if you need anything from my side" },
        { id: "idle-nudge", personaId: "manager", when: { type: "idle", minutes: 10 }, notBeforeMinutes: 5, prompt: "They've gone quiet. Send a light nudge asking if they're blocked.", text: "Still with me? Shout if you're blocked." },
        { id: "status-check", personaId: "manager", when: { type: "minutes_elapsed", atLeast: 30 }, prompt: "Leadership wants an early read. Ask for a two-sentence status.", text: "Leadership is asking for an early read — two sentences on where you are?" },
        { id: "draft-nudge", personaId: "manager", when: { type: "event", eventType: "submission_drafted" }, text: "Saw the write-up taking shape — lead with the answer 🙏" },
      ],
      leakGuards: [],
    },
    rubric: {
      problemSlug: slug,
      scale: { min: 0, max: 4 },
      criteria: [
        { key: "framing", label: "Problem framing", description: "Restates the real problem and what decision is needed.", weight: 0.2, weak: "Jumps to a solution.", strong: "Precise problem statement tied to the decision." },
        { key: "evidence", label: "Use of evidence", description: "Claims are backed by the available material.", weight: 0.3, weak: "Opinions without evidence.", strong: "Every key claim cites specific evidence." },
        { key: "solution", label: "Quality of the answer", description: "Finds what's actually going on and proposes a sound response.", weight: 0.3, weak: "Misses the real cause.", strong: "Identifies the real cause and a well-reasoned response." },
        { key: "communication", label: "Communication", description: "Clear, concise, decision-ready.", weight: 0.2, weak: "Hard to follow.", strong: "Skimmable, leads with the answer, states caveats." },
      ],
    },
    data: {},
  };
}
