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
              style={{ width: "100%" }}
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
              {stuckBusy ? "Asking…" : "🆘 I'm stuck"}
            </button>
          </div>
        )}
        <div className="sidebar-foot">
          <Link href="/">Casebench</Link>
          <span>{minutes} min in</span>
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
  return (
    <main className="page">
      <Link href="/">← All simulations</Link>
      <p className="muted" style={{ margin: "24px 0 4px" }}>
        {problem.companyName ?? titleCase(problem.company)} · {KNOWN_ROLES[problem.role] ?? problem.role} · {problem.estimatedMinutes} min
      </p>
      <h1 style={{ margin: 0 }}>{problem.title}</h1>
      <p style={{ maxWidth: 680 }}>{problem.brief}</p>
      <div className="card" style={{ display: "grid", gap: 12, maxWidth: 680 }}>
        <strong>Your team today</strong>
        {personas.map((p) => (
          <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Avatar persona={p} /> <span><strong>{p.name}</strong><br /><span className="muted">{p.title}</span></span>
          </div>
        ))}
        <p className="muted" style={{ margin: 0 }}>
          They're AI coworkers. They'll message you on Slack, notice what you're working on, and answer questions —
          but they won't do the analysis for you. Each of them knows different things.
        </p>
      </div>
      {run?.status === "published" && (
        <p>Your last attempt is published: <Link href={`/portfolio/${run.id}`}>view it</Link>.</p>
      )}
      <button className="primary" onClick={onStart} style={{ margin: "20px 0", padding: "10px 18px" }}>
        {run ? "Start a new attempt" : "Start the simulation"}
      </button>
      {error && <p className="error">{error}</p>}
      <div style={{ maxWidth: 680 }}>
        <Community slug={problem.slug} />
      </div>
    </main>
  );
}

function titleCase(slug: string) {
  return slug.replace(/(^|-)([a-z])/g, (_, sep: string, c: string) => (sep ? " " : "") + c.toUpperCase());
}
