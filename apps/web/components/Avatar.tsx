"use client";

import type { PublicPersona } from "./types";
import { useProfile } from "./Profile";

export function Avatar({ persona, small }: { persona: PublicPersona; small?: boolean }) {
  const initials = persona.name.split(" ").map((w) => w[0]).join("").slice(0, 2);
  return (
    <span className={`avatar ${small ? "sm" : ""}`} style={{ background: persona.avatarColor }} aria-hidden>
      {initials}
    </span>
  );
}

/** You, with your profile's initials (or "Y" before the profile has loaded). */
export function YouAvatar({ small }: { small?: boolean }) {
  const me = useProfile();
  const initials = me ? me.displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "Y";
  return (
    <span className={`avatar ${small ? "sm" : ""}`} style={{ background: "#475569" }} aria-hidden>
      {initials}
    </span>
  );
}
