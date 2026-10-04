"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KNOWN_ROLES, type AgentTrigger, type TriggerCondition } from "@casebench/domain";
import type { ScenarioBundle } from "@casebench/simulation-engine";
import { selectStyle } from "./StudioHome";

type Tab = "basics" | "coworkers" | "messages" | "grading" | "data" | "json";

const TABS: Array<[Tab, string]> = [
  ["basics", "Brief & deliverable"],
  ["coworkers", "Coworkers"],
  ["messages", "Proactive messages"],
  ["grading", "Answer key & grading"],
  ["data", "Data (CSV)"],
  ["json", "Advanced (JSON)"],
];

/**
 * The Scenario Studio editor. Edits one scenario bundle in memory; Save sends
 * it to the server, which validates it against the same schema used for the
 * official scenarios and returns readable errors if anything is off.
 */
export function ScenarioEditor({ id }: { id: string }) {
  const [b, setB] = useState<ScenarioBundle | null>(null);
  const [slug, setSlug] = useState("");
  const [listed, setListed] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [tab, setTab] = useState<Tab>("basics");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/studio/scenarios/${id}`)
      .then(async (r) => {
        const d = (await r.json()) as { scenario?: { bundle: ScenarioBundle; slug: string; listed: boolean; authorName: string | null }; error?: string };
        if (!r.ok || !d.scenario) throw new Error(d.error ?? `HTTP ${r.status}`);
        setB(d.scenario.bundle);
        setSlug(d.scenario.slug);
        setListed(d.scenario.listed);
        setAuthorName(d.scenario.authorName ?? "");
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [id]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (loadError) return <main className="page"><p className="error">{loadError}</p><Link href="/studio">← Studio</Link></main>;
  if (!b) return <main className="page muted">Loading…</main>;

  /** Apply an edit to a copy of the bundle. */
  const edit = (fn: (draft: ScenarioBundle) => void) => {
    const next = structuredClone(b);
    fn(next);
    setB(next);
    setDirty(true);
    setStatus(null);
  };

  async function save() {
    setSaving(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/studio/scenarios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle: b, authorName }),
      });
      const d = (await res.json()) as { error?: string; errors?: string[] };
      if (!res.ok) {
        setStatus(d.error ?? `HTTP ${res.status}`);
        setErrors(d.errors ?? []);
        return;
      }
      setDirty(false);
      setStatus("Saved ✓");
    } finally {
      setSaving(false);
    }
  }

  async function toggleListed() {
    const res = await fetch(`/api/studio/scenarios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listed: !listed }),
    });
    if (res.ok) setListed(!listed);
  }

  async function remove() {
    if (!confirm("Delete this scenario? Anyone with the link will lose access.")) return;
    await fetch(`/api/studio/scenarios/${id}`, { method: "DELETE" });
    location.href = "/studio";
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <header className="main-head" style={{ position: "sticky", top: 0, zIndex: 5, flexWrap: "wrap", height: "auto", padding: "10px 18px" }}>
        <Link href="/studio">← Studio</Link>
        <h2 style={{ flex: 1, minWidth: 200 }}>{b.problem.title}</h2>
        {status && <span className={errors.length ? "error" : "muted"}>{status}</span>}
        <button className="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : dirty ? "Save*" : "Save"}</button>
        <a className="pill" style={{ padding: "6px 12px", opacity: dirty ? 0.5 : 1 }} href={`/problems/${slug}`} target="_blank" rel="noreferrer" title={dirty ? "Save first to play the latest version" : ""}>
          ▶ Play
        </a>
        <button onClick={toggleListed} title="Show in the Community section of the home page">
          {listed ? "Listed ✓" : "List in Community"}
        </button>
        <a className="pill" style={{ padding: "6px 12px" }} href={`/api/studio/scenarios/${id}/export`}>Export</a>
        <button onClick={remove}>Delete</button>
      </header>

      {errors.length > 0 && (
        <div className="card" style={{ margin: 16, borderColor: "var(--bad)" }}>
          <strong>Not saved — fix these first:</strong>
          <ul className="error">{errors.slice(0, 30).map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <div className="tabs" style={{ display: "flex", gap: 4, padding: "8px 16px 0", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        {TABS.map(([t, label]) => (
          <button key={t} className={`nav-item ${tab === t ? "active" : ""}`} style={{ width: "auto" }} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      <div className="writeup" style={{ margin: "0 auto" }}>
        {tab === "basics" && <Basics b={b} edit={edit} authorName={authorName} setAuthorName={(v) => { setAuthorName(v); setDirty(true); }} />}
        {tab === "coworkers" && <Coworkers b={b} edit={edit} />}
        {tab === "messages" && <Messages b={b} edit={edit} />}
        {tab === "grading" && <Grading b={b} edit={edit} />}
        {tab === "data" && <Data b={b} edit={edit} />}
        {tab === "json" && <RawJson b={b} onApply={(next) => { setB(next); setDirty(true); }} />}
      </div>
    </div>
  );
}

type EditProps = { b: ScenarioBundle; edit: (fn: (d: ScenarioBundle) => void) => void };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label>
      {label}
      {hint && <span>{hint}</span>}
      {children}
    </label>
  );
}

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const slugify = (s: string, fallback: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || fallback;
const camel = (s: string, fallback: string) => {
  const words = s.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  const k = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join("");
  return /^[a-zA-Z]/.test(k) ? k.slice(0, 40) : fallback;
};
const unique = (base: string, taken: string[]) => {
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
};

function Basics({ b, edit, authorName, setAuthorName }: EditProps & { authorName: string; setAuthorName: (v: string) => void }) {
  const p = b.problem;
  const sections = p.deliverable ?? [];
  return (
    <>
      <Field label="Your name" hint="Shown as the author in the Community section.">
        <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
      </Field>
      <Field label="Title">
        <input value={p.title} onChange={(e) => edit((d) => void (d.problem.title = e.target.value))} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Field label="Role" hint={KNOWN_ROLES[p.role] ? "" : "custom role"}>
          <input value={p.role} onChange={(e) => edit((d) => void (d.problem.role = e.target.value.toLowerCase()))} list="roles" />
          <datalist id="roles">{Object.keys(KNOWN_ROLES).map((r) => <option key={r} value={r} />)}</datalist>
        </Field>
        <Field label="Company name">
          <input
            value={p.companyName ?? ""}
            onChange={(e) =>
              edit((d) => {
                d.problem.companyName = e.target.value;
                d.problem.company = slugify(e.target.value, "company");
                d.personas.forEach((x) => (x.company = e.target.value || "Company"));
              })
            }
          />
        </Field>
        <Field label="Slack channel">
          <input value={p.channel ?? ""} onChange={(e) => edit((d) => void (d.problem.channel = slugify(e.target.value, "project")))} />
        </Field>
        <Field label="Difficulty">
          <select style={selectStyle} value={p.difficulty} onChange={(e) => edit((d) => void (d.problem.difficulty = e.target.value as "easy"))}>
            <option>easy</option><option>medium</option><option>hard</option>
          </select>
        </Field>
        <Field label="Minutes">
          <input type="number" min={5} max={480} value={p.estimatedMinutes} onChange={(e) => edit((d) => void (d.problem.estimatedMinutes = Number(e.target.value)))} />
        </Field>
      </div>
      <Field label="Brief" hint="The manager's ask, in their voice. This is pinned in the project channel.">
        <textarea rows={7} value={p.brief} onChange={(e) => edit((d) => void (d.problem.brief = e.target.value))} />
      </Field>

      <h3 style={{ marginBottom: 0 }}>Resources</h3>
      <p className="muted" style={{ margin: 0 }}>Documents the person can read: specs, research notes, tickets, emails.</p>
      {p.resources.map((r, i) => (
        <div key={i} className="card" style={{ display: "grid", gap: 8 }}>
          <input value={r.title} placeholder="Title" onChange={(e) => edit((d) => void (d.problem.resources[i].title = e.target.value))} />
          <textarea rows={5} value={r.content} placeholder="Content" onChange={(e) => edit((d) => void (d.problem.resources[i].content = e.target.value))} />
          <button style={{ justifySelf: "start" }} onClick={() => edit((d) => void d.problem.resources.splice(i, 1))}>Remove</button>
        </div>
      ))}
      <button style={{ justifySelf: "start" }} onClick={() => edit((d) => void d.problem.resources.push({ title: "New resource", content: "…" }))}>+ Add resource</button>

      <h3 style={{ marginBottom: 0 }}>What they must hand in</h3>
      <p className="muted" style={{ margin: 0 }}>Sections of the write-up. The grader reads these against your answer key.</p>
      {sections.map((s, i) => (
        <div key={i} className="card" style={{ display: "grid", gap: 8 }}>
          <input value={s.label} placeholder="Section name" onChange={(e) => edit((d) => void (d.problem.deliverable![i].label = e.target.value))} />
          <input value={s.hint} placeholder="Hint shown under the section" onChange={(e) => edit((d) => void (d.problem.deliverable![i].hint = e.target.value))} />
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <label style={{ flexDirection: "row", alignItems: "center", fontWeight: "normal" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={!!s.required} onChange={(e) => edit((d) => void (d.problem.deliverable![i].required = e.target.checked))} /> required
            </label>
            <button onClick={() => edit((d) => void d.problem.deliverable!.splice(i, 1))}>Remove</button>
          </div>
        </div>
      ))}
      <button
        style={{ justifySelf: "start" }}
        onClick={() =>
          edit((d) => {
            d.problem.deliverable ??= [];
            const key = unique(camel(`section ${d.problem.deliverable.length + 1}`, "section"), d.problem.deliverable.map((x) => x.key));
            d.problem.deliverable.push({ key, label: "New section", hint: "", rows: 4 });
          })
        }
      >
        + Add section
      </button>

      <h3 style={{ marginBottom: 0 }}>Skills practised</h3>
      {p.concepts.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 8 }}>
          <input style={{ maxWidth: 220 }} value={c.name} onChange={(e) => edit((d) => void (d.problem.concepts[i].name = e.target.value))} />
          <input value={c.blurb} onChange={(e) => edit((d) => void (d.problem.concepts[i].blurb = e.target.value))} />
          <button onClick={() => edit((d) => void d.problem.concepts.splice(i, 1))}>×</button>
        </div>
      ))}
      <button style={{ justifySelf: "start" }} onClick={() => edit((d) => void d.problem.concepts.push({ name: "Skill", blurb: "Why it matters here." }))}>+ Add skill</button>
    </>
  );
}

function Coworkers({ b, edit }: EditProps) {
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Each coworker is an AI agent. Give them <strong>different</strong> knowledge so the person has to ask the right
        one. Exactly one must be the manager.
      </p>
      {b.personas.map((p, i) => {
        const ai = b.agents.agents.findIndex((a) => a.personaId === p.id);
        const a = b.agents.agents[ai];
        return (
          <div key={p.id} className="card" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              <Field label="Name"><input value={p.name} onChange={(e) => edit((d) => void (d.personas[i].name = e.target.value))} /></Field>
              <Field label="Job title"><input value={p.title} onChange={(e) => edit((d) => void (d.personas[i].title = e.target.value))} /></Field>
              <Field label="Role">
                <select style={selectStyle} value={p.role} onChange={(e) => edit((d) => void (d.personas[i].role = e.target.value as "manager"))}>
                  <option value="manager">manager</option><option value="colleague">colleague</option>
                </select>
              </Field>
              <Field label="Colour"><input type="color" value={p.avatarColor} onChange={(e) => edit((d) => void (d.personas[i].avatarColor = e.target.value))} style={{ height: 38, padding: 2 }} /></Field>
            </div>
            <Field label="How they write" hint="Tone, length, emoji, how busy they are.">
              <input value={p.tone} onChange={(e) => edit((d) => void (d.personas[i].tone = e.target.value))} />
            </Field>
            {a && (
              <>
                <Field label="What they know (private)" hint="One fact per line. Only this coworker knows these — never shown to the player directly.">
                  <textarea rows={5} value={a.knowledge.join("\n")} onChange={(e) => edit((d) => void (d.agents.agents[ai].knowledge = lines(e.target.value)))} />
                </Field>
                {a.hintLevels.map((h, hi) => (
                  <Field key={hi} label={`Hint level ${h.level}`} hint="What they may reveal once unlocked (after minutes spent or questions asked to them).">
                    <textarea rows={2} value={h.description} onChange={(e) => edit((d) => void (d.agents.agents[ai].hintLevels[hi].description = e.target.value))} />
                    <div style={{ display: "flex", gap: 8, fontWeight: "normal" }}>
                      <span className="muted">unlock after</span>
                      <input type="number" min={0} style={{ width: 80 }} value={h.unlockAfterMinutes ?? ""} onChange={(e) => edit((d) => void (d.agents.agents[ai].hintLevels[hi].unlockAfterMinutes = e.target.value === "" ? undefined : Number(e.target.value)))} />
                      <span className="muted">min or</span>
                      <input type="number" min={0} style={{ width: 80 }} value={h.unlockAfterUserMessages ?? ""} onChange={(e) => edit((d) => void (d.agents.agents[ai].hintLevels[hi].unlockAfterUserMessages = e.target.value === "" ? undefined : Number(e.target.value)))} />
                      <span className="muted">questions (blank = always)</span>
                    </div>
                  </Field>
                ))}
                <Field label="Must never" hint="One rule per line.">
                  <textarea rows={3} value={a.mustNot.join("\n")} onChange={(e) => edit((d) => void (d.agents.agents[ai].mustNot = lines(e.target.value)))} />
                </Field>
              </>
            )}
            <Field label="Offline reply" hint="What they say when no AI provider is configured.">
              <input value={p.offlineReply} onChange={(e) => edit((d) => void (d.personas[i].offlineReply = e.target.value))} />
            </Field>
            <button
              style={{ justifySelf: "start" }}
              disabled={b.personas.length <= 1}
              onClick={() =>
                edit((d) => {
                  d.personas.splice(i, 1);
                  d.agents.agents = d.agents.agents.filter((x) => x.personaId !== p.id);
                  d.agents.triggers = d.agents.triggers.filter((x) => x.personaId !== p.id);
                  d.agents.leakGuards = d.agents.leakGuards.filter((x) => x.personaId !== p.id);
                })
              }
            >
              Remove coworker
            </button>
          </div>
        );
      })}
      <button
        style={{ justifySelf: "start" }}
        disabled={b.personas.length >= 5}
        onClick={() =>
          edit((d) => {
            const id = unique("coworker", d.personas.map((x) => x.id));
            d.personas.push({
              id, name: "New Coworker", title: "Colleague", company: d.problem.companyName || "Company", role: "colleague",
              tone: "Friendly and concise.", avatarColor: "#ea580c", offlineReply: "what are you seeing? (offline mode)",
            });
            d.agents.agents.push({
              personaId: id, knowledge: ["Something only this person knows."],
              hintLevels: [{ level: 1, description: "If asked about their area, share it in general terms." }], mustNot: ["Do the work for them."],
            });
          })
        }
      >
        + Add coworker
      </button>
    </>
  );
}

const WHEN_LABELS: Record<TriggerCondition["type"], string> = {
  run_started: "when they start",
  minutes_elapsed: "after N minutes",
  idle: "when they go quiet for N minutes",
  query_count: "after N SQL queries",
  query_matches: "when a SQL query mentions…",
  event: "when they save a draft",
};

function defaultWhen(type: TriggerCondition["type"]): TriggerCondition {
  switch (type) {
    case "run_started": return { type };
    case "minutes_elapsed": return { type, atLeast: 15 };
    case "idle": return { type, minutes: 10 };
    case "query_count": return { type, atLeast: 5 };
    case "query_matches": return { type, pattern: "orders", atLeast: 1 };
    case "event": return { type, eventType: "submission_drafted" };
  }
}

function Messages({ b, edit }: EditProps) {
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Messages coworkers send <strong>on their own</strong>, based on what the person does. Use a fixed message, or an
        instruction the AI follows using what it can see of their work (the fixed text is then the offline fallback).
      </p>
      {b.agents.triggers.map((t, i) => (
        <div key={t.id} className="card" style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select style={selectStyle} value={t.personaId} onChange={(e) => edit((d) => void (d.agents.triggers[i].personaId = e.target.value))}>
              {b.personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select style={selectStyle} value={t.when.type} onChange={(e) => edit((d) => void (d.agents.triggers[i].when = defaultWhen(e.target.value as TriggerCondition["type"])))}>
              {Object.entries(WHEN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <WhenParam t={t} onChange={(when) => edit((d) => void (d.agents.triggers[i].when = when))} />
          </div>
          <Field label="Message" hint="Sent as-is (and used offline).">
            <textarea rows={2} value={t.text ?? ""} onChange={(e) => edit((d) => void (d.agents.triggers[i].text = e.target.value || undefined))} />
          </Field>
          <Field label="AI instruction (optional)" hint="e.g. “Ask what they've found so far, referring to what they've looked at.”">
            <textarea rows={2} value={t.prompt ?? ""} onChange={(e) => edit((d) => void (d.agents.triggers[i].prompt = e.target.value || undefined))} />
          </Field>
          <button style={{ justifySelf: "start" }} onClick={() => edit((d) => void d.agents.triggers.splice(i, 1))}>Remove</button>
        </div>
      ))}
      <button
        style={{ justifySelf: "start" }}
        onClick={() =>
          edit((d) => {
            const id = unique(`msg-${d.agents.triggers.length + 1}`, d.agents.triggers.map((x) => x.id));
            d.agents.triggers.push({ id, personaId: d.personas[0].id, when: { type: "minutes_elapsed", atLeast: 15 }, text: "How's it going?" });
          })
        }
      >
        + Add proactive message
      </button>
    </>
  );
}

function WhenParam({ t, onChange }: { t: AgentTrigger; onChange: (w: TriggerCondition) => void }) {
  const w = t.when;
  const num = (v: number, set: (n: number) => TriggerCondition) => (
    <input type="number" min={0} style={{ width: 90 }} value={v} onChange={(e) => onChange(set(Number(e.target.value)))} />
  );
  switch (w.type) {
    case "minutes_elapsed": return num(w.atLeast, (n) => ({ ...w, atLeast: n }));
    case "idle": return num(w.minutes, (n) => ({ ...w, minutes: Math.max(1, n) }));
    case "query_count": return num(w.atLeast, (n) => ({ ...w, atLeast: Math.max(1, n) }));
    case "query_matches":
      return <input style={{ maxWidth: 220 }} placeholder="word or table name" value={w.pattern} onChange={(e) => onChange({ ...w, pattern: e.target.value })} />;
    default:
      return null;
  }
}

function Grading({ b, edit }: EditProps) {
  const truth = b.problem.truthModel_INTERNAL_DO_NOT_EXPOSE_TO_USER;
  const truthText = typeof truth === "string" ? truth : JSON.stringify(truth, null, 2);
  return (
    <>
      <Field label="Answer key (hidden)" hint="What is actually going on, the evidence that proves it, red herrings, and what a strong answer looks like. Only the AI grader sees this.">
        <textarea
          rows={10}
          value={truthText}
          onChange={(e) =>
            edit((d) => {
              const v = e.target.value;
              let parsed: unknown = v;
              if (v.trim().startsWith("{")) {
                try { parsed = JSON.parse(v); } catch { parsed = v; }
              }
              d.problem.truthModel_INTERNAL_DO_NOT_EXPOSE_TO_USER = parsed;
            })
          }
        />
      </Field>
      <h3 style={{ marginBottom: 0 }}>Rubric</h3>
      <p className="muted" style={{ margin: 0 }}>Each criterion is scored 0–4. Describe what weak and strong look like; weights set importance.</p>
      {b.rubric.criteria.map((c, i) => (
        <div key={c.key} className="card" style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8 }}>
            <Field label="Criterion">
              <input value={c.label} onChange={(e) => edit((d) => void (d.rubric.criteria[i].label = e.target.value))} />
            </Field>
            <Field label="Weight">
              <input type="number" step={0.05} min={0.05} max={1} value={c.weight} onChange={(e) => edit((d) => void (d.rubric.criteria[i].weight = Number(e.target.value)))} />
            </Field>
          </div>
          <Field label="What it measures">
            <input value={c.description} onChange={(e) => edit((d) => void (d.rubric.criteria[i].description = e.target.value))} />
          </Field>
          <Field label="A weak answer…">
            <input value={c.weak} onChange={(e) => edit((d) => void (d.rubric.criteria[i].weak = e.target.value))} />
          </Field>
          <Field label="A strong answer…">
            <input value={c.strong} onChange={(e) => edit((d) => void (d.rubric.criteria[i].strong = e.target.value))} />
          </Field>
          <button style={{ justifySelf: "start" }} disabled={b.rubric.criteria.length <= 1} onClick={() => edit((d) => void d.rubric.criteria.splice(i, 1))}>Remove</button>
        </div>
      ))}
      <button
        style={{ justifySelf: "start" }}
        onClick={() =>
          edit((d) => {
            const key = unique(`criterion_${d.rubric.criteria.length + 1}`, d.rubric.criteria.map((x) => x.key));
            d.rubric.criteria.push({ key, label: "New criterion", description: "…", weight: 0.2, weak: "…", strong: "…" });
          })
        }
      >
        + Add criterion
      </button>
    </>
  );
}

function Data({ b, edit }: EditProps) {
  const data = b.data ?? {};
  async function add(files: FileList) {
    const loaded: Array<[string, string]> = [];
    for (const f of Array.from(files)) {
      const name = `${f.name.replace(/\.csv$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "table"}.csv`;
      loaded.push([name, await f.text()]);
    }
    edit((d) => {
      d.data ??= {};
      for (const [name, text] of loaded) {
        d.data[name] = text;
        if (!d.problem.dataFiles.includes(`data/${name}`)) d.problem.dataFiles.push(`data/${name}`);
      }
    });
  }
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Optional. Upload CSVs and the scenario gets a SQL workbench where each file is a table (named after the file).
        Up to 3 MB in total. No data = no SQL app, which is fine for design, PM, or writing cases.
      </p>
      {Object.entries(data).map(([name, text]) => (
        <div key={name} className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="mono" style={{ flex: 1 }}>{name.replace(/\.csv$/, "")}</span>
          <span className="muted">{Math.max(0, text.trim().split("\n").length - 1).toLocaleString()} rows · {(text.length / 1024).toFixed(0)} KB</span>
          <button
            onClick={() =>
              edit((d) => {
                delete d.data![name];
                d.problem.dataFiles = d.problem.dataFiles.filter((f) => f !== `data/${name}`);
              })
            }
          >
            Remove
          </button>
        </div>
      ))}
      <label className="pill" style={{ cursor: "pointer", padding: "8px 14px", justifySelf: "start" }}>
        + Upload CSV
        <input type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => e.target.files && add(e.target.files)} />
      </label>
    </>
  );
}

function RawJson({ b, onApply }: { b: ScenarioBundle; onApply: (next: ScenarioBundle) => void }) {
  const [text, setText] = useState(() => JSON.stringify(b, null, 2));
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Everything, including leak guards and offline grading keywords. Edit, Apply, then Save — the server checks it.
        See <code>docs/authoring-scenarios.md</code> for the format.
      </p>
      <textarea className="mono" rows={30} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          className="primary"
          onClick={() => {
            try {
              onApply(JSON.parse(text));
              setErr(null);
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          Apply
        </button>
        {err && <span className="error">{err}</span>}
      </div>
    </>
  );
}
