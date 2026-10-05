"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, YouAvatar } from "./Avatar";
import type { ChatMessage, PublicPersona } from "./types";

/** One DM conversation with an AI coworker, Slack-style. */
export function ChatView({
  persona,
  messages,
  waiting,
  error,
  onSend,
  compact,
}: {
  persona: PublicPersona;
  messages: ChatMessage[];
  waiting: boolean;
  error: string | null;
  onSend: (text: string) => void;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const first = persona.name.split(" ")[0];

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, waiting]);

  function send() {
    const text = draft.trim();
    if (!text || waiting) return;
    setDraft("");
    onSend(text);
  }

  return (
    <div className="chat">
      <div className="messages" aria-live="polite">
        {!compact && (
          <div className="intro">
            <Avatar persona={persona} />
            <h3>{persona.name}</h3>
            <div className="muted">
              {persona.title} · {persona.role === "manager" ? "your manager" : "teammate"}. This is the beginning of
              your direct messages with {first}.
            </div>
          </div>
        )}
        {messages.length === 0 && compact && <p className="muted">No messages yet.</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const cont = prev && prev.from === m.from && Date.parse(m.at) - Date.parse(prev.at) < 5 * 60_000;
          const mine = m.from === "you";
          return (
            <div key={i} className={`msg ${cont ? "cont" : ""}`}>
              {mine ? <YouAvatar small={compact} /> : <Avatar persona={persona} small={compact} />}
              <div className="msg-body">
                {!cont && (
                  <div className="msg-name">
                    {mine ? "You" : persona.name}
                    <span className="msg-time">
                      {new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                )}
                <div className="msg-text">{m.text}</div>
              </div>
            </div>
          );
        })}
        {waiting && <div className="typing">{first} is typing…</div>}
        {error && <p className="error">{error}</p>}
        <div ref={bottom} />
      </div>
      <div className="composer">
        <div className="composer-box">
          <textarea
            aria-label={`Message ${first}`}
            placeholder={`Message ${first}`}
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="primary" onClick={send} disabled={waiting || !draft.trim()} aria-label="Send">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
