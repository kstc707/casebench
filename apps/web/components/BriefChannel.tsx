"use client";

import { Avatar } from "./Avatar";
import type { ClientSafeCaseStudy, PublicPersona } from "./types";

/** The project channel: the manager's pinned brief, with resources as attachments. */
export function BriefChannel({
  channel,
  problem,
  manager,
  startedAt,
  onOpenResource,
}: {
  channel: string;
  problem: ClientSafeCaseStudy;
  manager: PublicPersona | undefined;
  startedAt: string;
  onOpenResource: (title: string) => void;
}) {
  return (
    <div className="messages">
      <div className="intro">
        <h3># {channel}</h3>
        <div className="muted">Project channel for “{problem.title}”. The brief is pinned below.</div>
      </div>
      <div className="msg">
        {manager && <Avatar persona={manager} />}
        <div className="msg-body" style={{ flex: 1 }}>
          <div className="msg-name">
            {manager?.name ?? "Manager"}
            <span className="msg-time">
              {new Date(startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · 📌 pinned
            </span>
          </div>
          <div className="pinned">
            <div className="msg-text">{problem.brief}</div>
          </div>
          {problem.resources.map((r) => (
            <details
              key={r.title}
              className="attachment"
              onToggle={(e) => {
                if ((e.target as HTMLDetailsElement).open) onOpenResource(r.title);
              }}
            >
              <summary>📄 {r.title}</summary>
              <pre>{r.content}</pre>
            </details>
          ))}
          <div className="attachment" style={{ padding: "9px 12px" }}>
            <strong>Skills this exercises</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {problem.concepts.map((c) => (
                <li key={c.name}>
                  {c.name} — <span className="muted">{c.blurb}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
