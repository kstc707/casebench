import { z } from "zod";
import type { AgentPersona, AgentsConfig, CaseStudyProblem, Rubric } from "@casebench/domain";

/**
 * The complete, self-contained definition of one scenario — everything an
 * author writes. The same schema validates scenarios from three places:
 * files in content/role-packs, the in-app Scenario Studio, and the import
 * script. If it passes here, the app can run it.
 */

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase letters, numbers and dashes only").max(60);
const text = (max: number) => z.string().trim().min(1).max(max);
const regex = z.string().max(500).refine((p) => {
  try {
    new RegExp(p, "i");
    return true;
  } catch {
    return false;
  }
}, "not a valid regular expression");

export const DeliverableSectionSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "letters, numbers and _ only").max(40),
  label: text(80),
  hint: z.string().max(300),
  rows: z.number().int().min(1).max(20).optional(),
  required: z.boolean().optional(),
});

export const ProblemSchema = z.object({
  type: z.literal("case-study"),
  slug,
  role: slug,
  company: slug,
  companyName: z.string().max(60).optional(),
  channel: slug.optional(),
  title: text(120),
  difficulty: z.enum(["easy", "medium", "hard"]),
  estimatedMinutes: z.number().int().min(5).max(480),
  concepts: z.array(z.object({ name: text(60), blurb: text(300) })).max(10),
  brief: text(4000),
  resources: z.array(z.object({ title: text(120), content: text(20000) })).max(20),
  dataFiles: z.array(z.string().regex(/^data\/[a-z0-9_]+\.csv$/, 'like "data/orders.csv"')).max(10),
  deliverable: z.array(DeliverableSectionSchema).min(1).max(8).optional(),
  truthModel_INTERNAL_DO_NOT_EXPOSE_TO_USER: z.unknown().refine((v) => v !== undefined && v !== null && v !== "", "an answer key is required"),
});

export const PersonaSchema = z.object({
  id: slug,
  name: text(60),
  title: text(80),
  company: text(60),
  role: z.enum(["manager", "colleague"]),
  tone: text(500),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour like "#7c3aed"'),
  model: z.string().max(100).optional(),
  offlineReply: text(300),
});

const TriggerConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run_started") }),
  z.object({ type: z.literal("event"), eventType: z.string().max(40) }),
  z.object({ type: z.literal("query_count"), atLeast: z.number().int().min(1) }),
  z.object({ type: z.literal("query_matches"), pattern: regex, atLeast: z.number().int().min(1) }),
  z.object({ type: z.literal("minutes_elapsed"), atLeast: z.number().min(0) }),
  z.object({ type: z.literal("idle"), minutes: z.number().min(1) }),
]);

export const AgentsConfigSchema = z.object({
  agents: z.array(
    z.object({
      personaId: slug,
      knowledge: z.array(text(2000)).min(1).max(20),
      hintLevels: z
        .array(
          z.object({
            level: z.number().int().min(1).max(5),
            description: text(500),
            unlockAfterMinutes: z.number().min(0).optional(),
            unlockAfterUserMessages: z.number().int().min(0).optional(),
          })
        )
        .max(5),
      mustNot: z.array(text(300)).max(10),
    })
  ),
  triggers: z
    .array(
      z
        .object({
          id: slug,
          personaId: slug,
          when: TriggerConditionSchema,
          text: z.string().max(1000).optional(),
          prompt: z.string().max(1000).optional(),
          notBeforeMinutes: z.number().min(0).optional(),
        })
        .refine((t) => t.text || t.prompt, "a trigger needs text or a prompt")
    )
    .max(20),
  leakGuards: z
    .array(
      z.object({
        personaId: z.string().max(60),
        pattern: regex,
        unlessUserSaid: regex.optional(),
        replacement: text(300),
      })
    )
    .max(20),
});

export const RubricSchema = z.object({
  problemSlug: slug,
  scale: z.object({ min: z.literal(0), max: z.number().int().min(1).max(10) }),
  criteria: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_]*$/).max(40),
        label: text(80),
        description: text(500),
        weight: z.number().positive().max(1),
        weak: text(500),
        strong: text(500),
        offlineKeywords: z.array(regex).max(6).optional(),
      })
    )
    .min(1)
    .max(10),
});

const MAX_DATA_BYTES = 3_000_000;

export const ScenarioBundleSchema = z
  .object({
    problem: ProblemSchema,
    personas: z.array(PersonaSchema).min(1).max(5),
    agents: AgentsConfigSchema,
    rubric: RubricSchema,
    /** CSV contents keyed by file name ("orders.csv"). Studio scenarios store data inline. */
    data: z.record(z.string().regex(/^[a-z0-9_]+\.csv$/), z.string()).optional(),
  })
  .superRefine((b, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const ids = new Set(b.personas.map((p) => p.id));
    if (ids.size !== b.personas.length) issue(["personas"], "persona ids must be unique");
    if (b.personas.filter((p) => p.role === "manager").length !== 1) issue(["personas"], "exactly one coworker must be the manager");
    b.agents.agents.forEach((a, i) => {
      if (!ids.has(a.personaId)) issue(["agents", "agents", i, "personaId"], `no coworker with id "${a.personaId}"`);
    });
    for (const p of b.personas) {
      if (!b.agents.agents.some((a) => a.personaId === p.id)) issue(["agents", "agents"], `${p.name} needs knowledge (an agents entry)`);
    }
    const triggerIds = new Set<string>();
    b.agents.triggers.forEach((t, i) => {
      if (!ids.has(t.personaId)) issue(["agents", "triggers", i, "personaId"], `no coworker with id "${t.personaId}"`);
      if (triggerIds.has(t.id)) issue(["agents", "triggers", i, "id"], `duplicate trigger id "${t.id}"`);
      triggerIds.add(t.id);
    });
    b.agents.leakGuards.forEach((g, i) => {
      if (g.personaId !== "*" && !ids.has(g.personaId)) issue(["agents", "leakGuards", i, "personaId"], `no coworker with id "${g.personaId}"`);
    });
    if (b.rubric.problemSlug !== b.problem.slug) issue(["rubric", "problemSlug"], "must match the problem slug");
    const keys = b.rubric.criteria.map((c) => c.key);
    if (new Set(keys).size !== keys.length) issue(["rubric", "criteria"], "criterion keys must be unique");
    const sections = (b.problem.deliverable ?? []).map((s) => s.key);
    if (new Set(sections).size !== sections.length) issue(["problem", "deliverable"], "section keys must be unique");
    if (b.data) {
      const names = b.problem.dataFiles.map((f) => f.replace(/^data\//, ""));
      for (const n of names) if (!(n in b.data)) issue(["data"], `missing contents for ${n}`);
      for (const n of Object.keys(b.data)) if (!names.includes(n)) issue(["data"], `${n} isn't listed in dataFiles`);
      const bytes = Object.values(b.data).reduce((s, t) => s + t.length, 0);
      if (bytes > MAX_DATA_BYTES) issue(["data"], `data is too large (${Math.round(bytes / 1e6)} MB, max 3 MB)`);
    }
  });

export interface ScenarioBundle {
  problem: CaseStudyProblem;
  personas: AgentPersona[];
  agents: AgentsConfig;
  rubric: Rubric;
  data?: Record<string, string>;
}

/** Validate untrusted input; returns friendly "path: message" errors. */
export function validateScenario(input: unknown): { ok: true; bundle: ScenarioBundle } | { ok: false; errors: string[] } {
  const r = ScenarioBundleSchema.safeParse(input);
  if (r.success) return { ok: true, bundle: r.data as unknown as ScenarioBundle };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "scenario"}: ${i.message}`),
  };
}
