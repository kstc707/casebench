"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * Profiles on the client: "pick a name" instead of email sign-up (it's a
 * demo). One dialog, mounted once in the root layout, is opened by
 * `requireProfile()` from anywhere; it resolves true once you have a profile.
 */

export interface ProfileInfo {
  handle: string;
  displayName: string;
}

const CHANGED = "cb:profile-changed";
const OPEN = "cb:profile-open";

let cached: ProfileInfo | null | undefined;

async function fetchProfile(): Promise<ProfileInfo | null> {
  const res = await fetch("/api/profile", { cache: "no-store" });
  cached = res.ok ? ((await res.json()) as { profile: ProfileInfo | null }).profile : null;
  return cached;
}

/** Your profile (null = guest, undefined = still loading); updates everywhere when it changes. */
export function useProfile(): ProfileInfo | null | undefined {
  const [p, setP] = useState<ProfileInfo | null | undefined>(cached);
  useEffect(() => {
    const refresh = () => void fetchProfile().then(setP);
    refresh();
    window.addEventListener(CHANGED, refresh);
    return () => window.removeEventListener(CHANGED, refresh);
  }, []);
  return p;
}

/** Resolves true when the visitor has a profile, opening the dialog if needed. */
export async function requireProfile(reason?: string): Promise<boolean> {
  if ((cached ?? (await fetchProfile())) !== null) return true;
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent(OPEN, { detail: { reason, resolve } }));
  });
}

export async function signOutProfile() {
  await fetch("/api/profile/signout", { method: "POST" });
  cached = null;
  window.dispatchEvent(new Event(CHANGED));
}

/** Header chip: "@you" linking to your profile, or a "Create profile" button. */
export function ProfileChip() {
  const p = useProfile();
  if (p === undefined) return null;
  if (!p) {
    return (
      <button className="pill" style={{ padding: "6px 12px", cursor: "pointer" }} onClick={() => void requireProfile()}>
        👤 Create profile
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <Link className="pill" style={{ padding: "6px 12px" }} href={`/u/${p.handle}`}>
        👤 {p.displayName}
      </Link>
      <button className="pill" style={{ padding: "6px 10px", cursor: "pointer" }} onClick={() => void signOutProfile()} title="Sign out on this device">
        Sign out
      </button>
    </span>
  );
}

type Step = { kind: "name" } | { kind: "signin" } | { kind: "key"; key: string; profile: ProfileInfo };

/** The one dialog. Mounted in the root layout. */
export function ProfileDialogHost() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const [resolver, setResolver] = useState<((ok: boolean) => void) | null>(null);
  const [step, setStep] = useState<Step>({ kind: "name" });
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ reason?: string; resolve?: (ok: boolean) => void }>).detail ?? {};
      setReason(d.reason);
      setResolver(() => d.resolve ?? null);
      setStep({ kind: "name" });
      setError(null);
      setOpen(true);
    };
    window.addEventListener(OPEN, onOpen);
    return () => window.removeEventListener(OPEN, onOpen);
  }, []);

  const close = useCallback(
    (ok: boolean) => {
      setOpen(false);
      resolver?.(ok);
      setResolver(null);
      if (ok) window.dispatchEvent(new Event(CHANGED));
    },
    [resolver]
  );

  async function call(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { profile?: ProfileInfo; key?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return null;
      }
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const d = await call("/api/profile", { name });
    if (d?.profile && d.key) {
      cached = d.profile;
      setStep({ kind: "key", key: d.key, profile: d.profile });
    }
  }

  async function signIn() {
    const d = await call("/api/profile/signin", { handle, key });
    if (d?.profile) {
      cached = d.profile;
      close(true);
    }
  }

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Your profile">
      <div className="card modal">
        {step.kind === "name" && (
          <>
            <h2 style={{ margin: 0 }}>Pick a name</h2>
            <p className="muted" style={{ margin: 0 }}>
              {reason ?? "Your attempts, scores and simulations are recorded under this name."} No email or password needed.
            </p>
            <input
              autoFocus
              placeholder="e.g. Sai Teja"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim().length >= 2 && void create()}
            />
            {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="primary" disabled={busy || name.trim().length < 2} onClick={() => void create()}>
                Create profile
              </button>
              <button onClick={() => close(false)}>Cancel</button>
              <button className="link" style={{ marginLeft: "auto" }} onClick={() => { setError(null); setStep({ kind: "signin" }); }}>
                Already have a profile?
              </button>
            </div>
          </>
        )}

        {step.kind === "signin" && (
          <>
            <h2 style={{ margin: 0 }}>Sign in to your profile</h2>
            <p className="muted" style={{ margin: 0 }}>Use your @name and the profile key you saved when you created it.</p>
            <input autoFocus placeholder="@your-name" value={handle} onChange={(e) => setHandle(e.target.value)} />
            <input placeholder="profile key, e.g. k7m2-q9xa-4rtp" value={key} onChange={(e) => setKey(e.target.value)} />
            {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary" disabled={busy || !handle.trim() || !key.trim()} onClick={() => void signIn()}>
                Sign in
              </button>
              <button onClick={() => { setError(null); setStep({ kind: "name" }); }}>Back</button>
            </div>
          </>
        )}

        {step.kind === "key" && (
          <>
            <h2 style={{ margin: 0 }}>Welcome, {step.profile.displayName}!</h2>
            <p style={{ margin: 0 }}>
              Your profile is <Link href={`/u/${step.profile.handle}`}>@{step.profile.handle}</Link>. This browser stays signed in.
            </p>
            <p className="muted" style={{ margin: 0 }}>
              To use it on another device, you'll need this <strong>profile key</strong>. Save it now: it's shown only once.
            </p>
            <code className="profile-key" data-testid="profile-key">{step.key}</code>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => void navigator.clipboard?.writeText(`@${step.profile.handle} ${step.key}`)}>Copy</button>
              <button className="primary" onClick={() => close(true)}>Continue</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
