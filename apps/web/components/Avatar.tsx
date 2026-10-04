import type { PublicPersona } from "./types";

export function Avatar({ persona, small }: { persona: PublicPersona; small?: boolean }) {
  const initials = persona.name.split(" ").map((w) => w[0]).join("").slice(0, 2);
  return (
    <span className={`avatar ${small ? "sm" : ""}`} style={{ background: persona.avatarColor }} aria-hidden>
      {initials}
    </span>
  );
}

export function YouAvatar({ small }: { small?: boolean }) {
  return (
    <span className={`avatar ${small ? "sm" : ""}`} style={{ background: "#475569" }} aria-hidden>
      Y
    </span>
  );
}
