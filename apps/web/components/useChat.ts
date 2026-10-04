"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMessages, sendMessage } from "./api";
import type { ChatMessage } from "./types";

const POLL_MS = 4000;

/**
 * All Slack state for a run, shared by the sidebar (unread badges), the chat
 * views, and the toasts. Polls the server every few seconds; each poll also
 * lets the agents speak up on their own (they watch the run's event log).
 */
export function useChat(runId: string, visibleChannels: string[], nudge: number) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [waitingOn, setWaitingOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ChatMessage[]>([]);
  const known = useRef<number | null>(null);
  const visible = useRef(visibleChannels);
  visible.current = visibleChannels;

  const apply = useCallback((next: ChatMessage[]) => {
    // New agent messages in a conversation you're not looking at → toast.
    if (known.current !== null && next.length > known.current) {
      const fresh = next
        .slice(known.current)
        .filter((m) => m.from !== "you" && !visible.current.includes(m.channel));
      if (fresh.length) setToasts((t) => [...t, ...fresh].slice(-3));
    }
    known.current = next.length;
    setMessages(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply((await getMessages(runId)).messages);
    } catch {
      // Transient poll failures are fine; the next tick retries.
    }
  }, [runId, apply]);

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

  // Whatever is on screen counts as read.
  useEffect(() => {
    setSeen((s) => {
      const next = { ...s };
      for (const c of visibleChannels) next[c] = messages.filter((m) => m.channel === c).length;
      return next;
    });
    setToasts((t) => t.filter((m) => !visibleChannels.includes(m.channel)));
  }, [messages, visibleChannels.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const unread = (channel: string) =>
    Math.max(0, messages.filter((m) => m.channel === channel).length - (seen[channel] ?? 0));

  async function send(channel: string, text: string) {
    setError(null);
    setWaitingOn(channel);
    const optimistic = [...messages, { from: "you", channel, text, at: new Date().toISOString() }];
    known.current = optimistic.length;
    setMessages(optimistic);
    try {
      apply((await sendMessage(runId, channel, text)).messages);
    } catch (e) {
      setError((e as Error).message);
      void refresh();
    } finally {
      setWaitingOn(null);
    }
  }

  const dismissToast = (i: number) => setToasts((t) => t.filter((_, j) => j !== i));

  return { messages, unread, send, waitingOn, error, toasts, dismissToast };
}
