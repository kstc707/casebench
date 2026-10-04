"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMessages, sendMessage } from "./api";
import type { ChatMessage, PublicPersona } from "./types";

const POLL_MS = 4000;

/**
 * A Slack-style DM panel, one channel per AI coworker. It polls the server
 * every few seconds: new proactive messages appear on their own, because the
 * agents are watching the run's event log and decide when to speak up.
 */
export function SlackPanel({
  runId,
  personas,
  nudge,
}: {
  runId: string;
  personas: PublicPersona[];
  /** Bumped by the workspace after the user does something, to check sooner. */
  nudge: number;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [channel, setChannel] = useState(personas.find((p) => p.role === "manager")?.id ?? personas[0]?.id);
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setMessages((await getMessages(runId)).messages);
    } catch {
      // Transient poll failures are fine; the next tick retries.
    }
  }, [runId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (nudge === 0) return;
    const t = setTimeout(refresh, 2500); // give the server's after() hook a moment
    return () => clearTimeout(t);
  }, [nudge, refresh]);

  const inChannel = messages.filter((m) => m.channel === channel);

  // Mark the open channel as read, and keep it scrolled to the newest message.
  useEffect(() => {
    if (!channel) return;
    setSeen((s) => ({ ...s, [channel]: inChannel.length }));
    bottom.current?.scrollIntoView({ block: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, inChannel.length]);

  async function send() {
    const text = draft.trim();
    if (!text || !channel || waiting) return;
    setDraft("");
    setError(null);
    setWaiting(true);
    setMessages((m) => [...m, { from: "you", channel, text, at: new Date().toISOString() }]);
    try {
      setMessages((await sendMessage(runId, channel, text)).messages);
    } catch (e) {
      setError((e as Error).message);
      void refresh();
    } finally {
      setWaiting(false);
    }
  }

  const persona = (id: string) => personas.find((p) => p.id === id);
  const active = channel ? persona(channel) : undefined;

  return (
    <div className="slack">
      <div className="slack-channels">
        {personas.map((p) => {
          const unread = messages.filter((m) => m.channel === p.id).length - (seen[p.id] ?? 0);
          return (
            <button
              key={p.id}
              className={`slack-channel ${p.id === channel ? "active" : ""}`}
              onClick={() => setChannel(p.id)}
              title={p.title}
            >
              <Avatar persona={p} />
              {p.name.split(" ")[0]}
              {p.id !== channel && unread > 0 && <span className="badge">{unread}</span>}
            </button>
          );
        })}
      </div>
      {active && (
        <div className="section muted" style={{ paddingBottom: 0 }}>
          Direct message with <strong>{active.name}</strong> · {active.title}
        </div>
      )}
      <div className="slack-messages" aria-live="polite">
        {inChannel.length === 0 && <p className="muted">No messages yet. Say hi, or ask a question.</p>}
        {inChannel.map((m, i) => {
          const p = persona(m.from);
          return (
            <div key={i} className="msg">
              {p ? <Avatar persona={p} /> : <span className="avatar" style={{ background: "#475569" }} aria-hidden>Y</span>}
              <div className="msg-body">
                <div className="msg-name">
                  {p ? p.name : "You"}
                  <span className="msg-time">
                    {new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                <div className="msg-text">{m.text}</div>
              </div>
            </div>
          );
        })}
        {waiting && active && <p className="muted">{active.name.split(" ")[0]} is typing…</p>}
        {error && <p className="error">{error}</p>}
        <div ref={bottom} />
      </div>
      <div className="slack-input">
        <textarea
          aria-label="Message"
          placeholder={active ? `Message ${active.name.split(" ")[0]}` : "Message"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="primary" onClick={send} disabled={waiting || !draft.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

export function Avatar({ persona }: { persona: PublicPersona }) {
  const initials = persona.name.split(" ").map((w) => w[0]).join("").slice(0, 2);
  return (
    <span className="avatar" style={{ background: persona.avatarColor }} aria-hidden>
      {initials}
    </span>
  );
}
