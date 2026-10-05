"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getRun, latestRun, logEvent, startRun } from "./api";
import { Avatar } from "./Avatar";
import { BriefChannel } from "./BriefChannel";
import { ChatView } from "./ChatView";
import { Feedback } from "./Feedback";
import { SqlConsole } from "./SqlConsole";
import { useChat } from "./useChat";
import { WriteUp } from "./WriteUp";
import { Community } from "./Community";
import { DEFAULT_DELIVERABLE, KNOWN_ROLES } from "@casebench/domain";
import type { ClientSafeCaseStudy, PublicPersona, RunDetail, ScoredEvaluation, Submission } from "./types";
import { requireProfile } from "./Profile";
import { Shell } from "./Shell";
import { RoleLabel } from "./Discover";

type App = "sql" | "writeup" | "feedback";
type View = { kind: "channel" } | { kind: "dm"; id: string } | { kind: "app"; app: App };

const APP_LABELS: Record<App, { icon: string; label: string }> = {
  sql: { icon: "⌘", label: "SQL workbench" },
  writeup: { icon: "✎", label: "Write-up" },
  feedback: { icon: "★", label: "Feedback" },
};

/**
 * The simulated workday, Slack-first: a sidebar with the project channel,
 * DMs with AI coworkers, and work "apps". When an app is open, the current
 * conversation stays docked on the right so you can keep talking while you
 * work. All state lives on the server as the run's event log.
 */
export function Workspace({
  problem,
  personas,
  labels,
}: {
  problem: ClientSafeCaseStudy;
  personas: PublicPersona[];
  labels: Record<string, string>;
}) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    latestRun(problem.slug)
      .then(setRun)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoaded(true));
  }, [problem.slug]);

  async function start() {
    setError(null);
    // Attempts and scores are recorded under a name, so ask for one first.
    if (!(await requireProfile("Your attempt and score will be recorded under this name."))) return;
    try {
      setRun(await startRun(problem.slug));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!loaded) return <main className="page muted">Loading…</main>;
  if (!run || run.status === "published") {
    return <StartScreen problem={problem} personas={personas} run={run} onStart={start} error={error} />;
  }
  return (
    <Workday
      key={run.id}
      run={run}
      problem={problem}
      personas={personas}
      labels={labels}
      onRefresh={async () => setRun(await getRun(run.id))}
    />
  );
}

function Workday({
  run,
  problem,
  personas,
  labels,
  onRefresh,
}: {
  run: RunDetail;
  problem: ClientSafeCaseStudy;
  personas: PublicPersona[];
  labels: Record<string, string>;
  onRefresh: () => Promise<void>;
}) {
  const manager = personas.find((p) => p.role === "manager") ?? personas[0];
  const channel = problem.channel ?? problem.slug;
  const companyName = problem.companyName ?? titleCase(problem.company);
  const hasData = problem.dataFiles.length > 0;
  const evaluation = (run.events.find((e) => e.type === "evaluation_returned") as { feedback: ScoredEvaluation } | undefined)?.feedback;
  const finalized = run.events.find((e) => e.type === "submission_finalized") as { submission: Submission } | undefined;
  const lastDraft = [...run.events].reverse().find((e) => e.type === "submission_drafted") as { draft: Submission } | undefined;

  const [view, setView] = useState<View>(evaluation ? { kind: "app", app: "feedback" } : { kind: "dm", id: manager.id });
  const [dockId, setDockId] = useState(manager.id);
  const [nudge, setNudge] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [stuckBusy, setStuckBusy] = useState(false);
  const bump = () => setNudge((n) => n + 1);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const visible = useMemo(
    () => (view.kind === "dm" ? [view.id] : view.kind === "app" ? [dockId] : []),
    [view, dockId]
  );
  const chat = useChat(run.id, visible, nudge);
  const persona = (id: string) => personas.find((p) => p.id === id)!;
  const openDm = (id: string) => {
    setView({ kind: "dm", id });
    setDockId(id);
  };

  const minutes = Math.max(0, Math.floor((now - Date.parse(run.events[0]?.at ?? new Date().toISOString())) / 60_000));
  const apps: App[] = [...(hasData ? (["sql"] as App[]) : []), "writeup", ...(evaluation ? (["feedback"] as App[]) : [])];
  const isApp = (a: App) => view.kind === "app" && view.app === a;

  return (
    <div className={`app ${view.kind === "app" ? "with-dock" : ""}`}>
      <div className="app-top">
        <span>
          <Link href="/">Casebench</Link> › <Link href={`/problems/${problem.slug}`}>{problem.title}</Link>
        </span>
        <span>
          <strong>{minutes} min</strong> in · ~{problem.estimatedMinutes} min expected
        </span>
      </div>
      <nav className="sidebar" aria-label="Workspace">
        <div className="ws-name">
          <strong>{companyName}</strong>
          <span>{KNOWN_ROLES[problem.role] ?? problem.role} · {run.status.replace("_", " ")}</span>
        </div>
        <div className="nav">
          <h4>Channels</h4>
          <button className={`nav-item ${view.kind === "channel" ? "active" : ""}`} onClick={() => setView({ kind: "channel" })}>
            <span className="icon">#</span> {channel}
          </button>
          <h4>Direct messages</h4>
          {personas.map((p) => {
            const n = chat.unread(p.id);
            const active = view.kind === "dm" && view.id === p.id;
            return (
              <button key={p.id} className={`nav-item ${active ? "active" : ""} ${n && !active ? "unread" : ""}`} onClick={() => openDm(p.id)}>
                <Avatar persona={p} small /> {p.name} <span className="presence" title="online" />
                {n > 0 && !visible.includes(p.id) && <span className="badge">{n}</span>}
              </button>
            );
          })}
          <h4>Apps</h4>
          {apps.map((a) => (
            <button key={a} className={`nav-item ${isApp(a) ? "active" : ""}`} onClick={() => setView({ kind: "app", app: a })}>
              <span className="icon">{APP_LABELS[a].icon}</span> {APP_LABELS[a].label}
            </button>
          ))}
        </div>
        {!evaluation && (
          <div style={{ padding: "8px 12px" }}>
            <button
              className="stuck"
              disabled={stuckBusy}
              title="Ask the coworker you're talking to (or your manager) for one stronger hint"
              onClick={async () => {
                const channel = view.kind === "dm" ? view.id : dockId;
                setStuckBusy(true);
                openDm(channel);
                try {
                  await fetch(`/api/runs/${run.id}/hint`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ channel }),
                  });
                } finally {
                  setStuckBusy(false);
                  bump();
                }
              }}
            >
              {stuckBusy ? "Asking…" : "I'm stuck: ask for a hint"}
            </button>
          </div>
        )}
        <div className="sidebar-foot">
          <Link href="/">← Leave workspace</Link>
        </div>
      </nav>

      <main className="main">
        <header className="main-head">
          {view.kind === "channel" && <h2># {channel}</h2>}
          {view.kind === "dm" && (
            <>
              <Avatar persona={persona(view.id)} small />
              <h2>{persona(view.id).name}</h2>
              <span className="muted">{persona(view.id).title}</span>
            </>
          )}
          {view.kind === "app" && <h2>{APP_LABELS[view.app].label}</h2>}
        </header>
        <div className="main-body">
          {view.kind === "channel" && (
            <BriefChannel
              channel={channel}
              problem={problem}
              manager={manager}
              startedAt={run.events[0]?.at ?? new Date().toISOString()}
              onOpenResource={(title) => {
                void logEvent(run.id, { type: "resource_opened", resourceTitle: title });
                bump();
              }}
            />
          )}
          {view.kind === "dm" && (
            <ChatView
              persona={persona(view.id)}
              messages={chat.messages.filter((m) => m.channel === view.id)}
              waiting={chat.waitingOn === view.id}
              error={chat.error}
              onSend={(text) => void chat.send(view.id, text)}
            />
          )}
          {/* The SQL app stays mounted so loaded tables and results survive navigation. */}
          {hasData && (
            <div style={{ display: isApp("sql") ? "flex" : "none", flex: 1, minHeight: 0, flexDirection: "column" }}>
              <SqlConsole runId={run.id} problemSlug={problem.slug} dataFiles={problem.dataFiles} onQueryLogged={bump} />
            </div>
          )}
          {isApp("writeup") && (
            <WriteUp
              runId={run.id}
              sections={problem.deliverable ?? DEFAULT_DELIVERABLE}
              initial={finalized?.submission ?? lastDraft?.draft ?? null}
              locked={!!finalized}
              onActivity={bump}
              onSubmitted={async () => {
                await onRefresh();
                setView({ kind: "app", app: "feedback" });
                bump();
              }}
            />
          )}
          {isApp("feedback") && evaluation && (
            <>
              <Feedback runId={run.id} evaluation={evaluation} labels={labels} published={false} />
              <div className="writeup" style={{ paddingTop: 0 }}>
                <Community slug={problem.slug} showRatePrompt />
              </div>
            </>
          )}
        </div>
      </main>

      {view.kind === "app" && (
        <aside className="dock" aria-label="Chat">
          <header className="main-head" style={{ gap: 6 }}>
            {personas.map((p) => (
              <button
                key={p.id}
                className={`nav-item ${dockId === p.id ? "active" : ""} ${chat.unread(p.id) && dockId !== p.id ? "unread" : ""}`}
                style={{ width: "auto" }}
                onClick={() => setDockId(p.id)}
              >
                <Avatar persona={p} small /> {p.name.split(" ")[0]}
                {chat.unread(p.id) > 0 && dockId !== p.id && <span className="badge">{chat.unread(p.id)}</span>}
              </button>
            ))}
          </header>
          <ChatView
            compact
            persona={persona(dockId)}
            messages={chat.messages.filter((m) => m.channel === dockId)}
            waiting={chat.waitingOn === dockId}
            error={chat.error}
            onSend={(text) => void chat.send(dockId, text)}
          />
        </aside>
      )}

      <div className="toasts" aria-live="polite">
        {chat.toasts.map((m, i) => {
          const p = persona(m.channel);
          return (
            <button
              key={`${m.at}-${i}`}
              className="toast"
              onClick={() => {
                chat.dismissToast(i);
                if (view.kind === "app") setDockId(m.channel);
                else openDm(m.channel);
              }}
            >
              <Avatar persona={p} small />
              <span>
                <strong>{p.name}</strong>
                <p>{m.text}</p>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StartScreen({
  problem,
  personas,
  run,
  onStart,
  error,
}: {
  problem: ClientSafeCaseStudy;
  personas: PublicPersona[];
  run: RunDetail | null;
  onStart: () => void;
  error: string | null;
}) {
  const company = problem.companyName ?? titleCase(problem.company);
  const manager = personas.find((p) => p.role === "manager");
  return (
    <Shell
      active="problems"
      crumbs={
        <>
          <Link href="/">Problems</Link> / {KNOWN_ROLES[problem.role] ?? problem.role} / <strong>{company}</strong>
        </>
      }
    >
      <main className="page">
        <div className="ticket">
          <div>
            <RoleLabel role={problem.role} />
            <h1>{problem.title}</h1>
            <section className="doc">
              <h2 style={{ marginTop: 0 }}>Description</h2>
              {manager && (
                <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                  From {manager.name}, {manager.title}
                </div>
              )}
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{problem.brief}</p>

              <h2>What you'll practise</h2>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {problem.concepts.map((c) => (
                  <li key={c.name} style={{ marginBottom: 4 }}>
                    <strong>{c.name}</strong> <span className="muted">— {c.blurb}</span>
                  </li>
                ))}
              </ul>

              <h2>Activity</h2>
              <Community slug={problem.slug} />
            </section>
          </div>

          <aside className="side">
            <button className="primary" onClick={onStart} style={{ padding: "10px 16px", fontSize: 15 }}>
              {run ? "Start a new attempt" : `Join ${company}'s workspace`}
            </button>
            {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
            {run?.status === "published" && (
              <p style={{ margin: 0, fontSize: 14 }}>
                Your last attempt is published: <Link href={`/portfolio/${run.id}`}>view it</Link>.
              </p>
            )}
            <div className="props">
              <h3>Details</h3>
              <div className="prop"><span>Company</span><span>{company}</span></div>
              <div className="prop"><span>Team</span><span><RoleLabel role={problem.role} /></span></div>
              <div className="prop"><span>Estimate</span><span>{problem.estimatedMinutes} min</span></div>
              <div className="prop"><span>Difficulty</span><span style={{ textTransform: "capitalize" }}>{problem.difficulty}</span></div>
              <div className="prop"><span>Hand in</span><span>{(problem.deliverable ?? DEFAULT_DELIVERABLE).length}-part write-up</span></div>
              {problem.dataFiles.length > 0 && (
                <div className="prop"><span>Data</span><span>{problem.dataFiles.length} table{problem.dataFiles.length === 1 ? "" : "s"} (SQL)</span></div>
              )}
            </div>
            <div className="props">
              <h3>Your team</h3>
              <div style={{ padding: "4px 14px 8px" }}>
                {personas.map((p) => (
                  <div key={p.id} className="person">
                    <Avatar persona={p} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>{p.title}{p.role === "manager" ? " · your manager" : ""}</small>
                    </span>
                  </div>
                ))}
                <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
                  AI coworkers. They message you, notice what you're doing and answer questions, but won't do the work
                  for you. Each knows different things.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </Shell>
  );
}

function titleCase(slug: string) {
  return slug.replace(/(^|-)([a-z])/g, (_, sep: string, c: string) => (sep ? " " : "") + c.toUpperCase());
}
