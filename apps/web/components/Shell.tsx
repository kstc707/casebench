"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ProfileChip, useProfile } from "./Profile";

/**
 * The frame around everything outside a simulation, like a work tool:
 * a left nav (Problems, Create, your profile, the author agent for admins)
 * and a top bar with breadcrumbs.
 */
export function Shell({ active, crumbs, children }: { active?: "problems" | "create" | "profile" | "agent"; crumbs?: ReactNode; children: ReactNode }) {
  const me = useProfile();
  const link = (key: typeof active, href: string, icon: string, label: string) => (
    <Link href={href} className={active === key ? "active" : ""}>
      <span className="ico" aria-hidden>{icon}</span>
      {label}
    </Link>
  );
  return (
    <div className="shell">
      <nav className="shell-nav" aria-label="Casebench">
        <Link href="/" className="shell-brand">
          <span className="logo">cb</span> Casebench
        </Link>
        <div className="shell-links">
          {link("problems", "/", "▤", "Problems")}
          {link("create", "/studio", "✎", "Create")}
          {me && link("profile", `/u/${me.handle}`, "◉", "Your work")}
        </div>
        {me?.isAdmin && (
          <>
            <div className="shell-section">Admin</div>
            <div className="shell-links">{link("agent", "/admin/agent", "✦", "Author agent")}</div>
          </>
        )}
        <div className="shell-foot">
          <ProfileChip />
        </div>
      </nav>
      <div className="shell-main">
        <header className="topbar">
          <div className="crumbs">{crumbs}</div>
        </header>
        {children}
      </div>
    </div>
  );
}
