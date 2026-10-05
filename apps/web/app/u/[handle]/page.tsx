import Link from "next/link";
import { notFound } from "next/navigation";
import { KNOWN_ROLES } from "@casebench/domain";
import { createdBy, getUserByHandle, solvedBy } from "@casebench/database";
import { getPool } from "../../../lib/db";
import { getBundle } from "../../../lib/problems";
import { getProfile } from "../../../lib/session";
import { ProfileChip } from "../../../components/Profile";

export const dynamic = "force-dynamic";

/**
 * A person's public page: what they've solved and what they've created.
 * Scores are only shown to the person themselves.
 */
export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const pool = getPool();
  const user = await getUserByHandle(pool, decodeURIComponent(handle));
  if (!user) notFound();

  const [viewer, solved, created] = await Promise.all([getProfile(), solvedBy(pool, user.id), createdBy(pool, user.id)]);
  const isMe = viewer?.id === user.id;
  const title = async (slug: string) => {
    const b = await getBundle(slug);
    return b ? { title: b.problem.title, role: b.problem.role } : null;
  };
  const solvedRows = (await Promise.all(solved.map(async (s) => ({ ...s, info: await title(s.slug) })))).filter((s) => s.info);
  const createdRows = (await Promise.all(created.map(async (c) => ({ ...c, info: await title(c.slug) })))).filter((c) => c.info);

  return (
    <main className="page" style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <Link href="/">← Casebench</Link>
        <ProfileChip />
      </div>
      <div>
        <h1 style={{ marginBottom: 4 }}>{user.displayName}</h1>
        <div className="muted">
          @{user.handle} · solved {solvedRows.length} · created {createdRows.length}
          {isMe && " · this is you"}
        </div>
      </div>

      <section className="card" style={{ display: "grid", gap: 8 }}>
        <strong>Solved ({solvedRows.length})</strong>
        {solvedRows.length === 0 && <span className="muted">Nothing solved yet.</span>}
        {solvedRows.map((s) => (
          <div key={s.slug} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/problems/${s.slug}`}>{s.info!.title}</Link>
            <span className="muted" style={{ fontSize: 13 }}>
              {KNOWN_ROLES[s.info!.role] ?? s.info!.role} · {new Date(s.firstSolvedAt).toLocaleDateString()}
              {s.attempts > 1 && ` · ${s.attempts} attempts`}
              {isMe && s.bestScore !== null && ` · best ${s.bestScore}/100`}
            </span>
          </div>
        ))}
      </section>

      <section className="card" style={{ display: "grid", gap: 8 }}>
        <strong>Created ({createdRows.length})</strong>
        {createdRows.length === 0 && <span className="muted">No published simulations yet.</span>}
        {createdRows.map((c) => (
          <div key={c.slug} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/problems/${c.slug}`}>{c.info!.title}</Link>
            <span className="muted" style={{ fontSize: 13 }}>
              {KNOWN_ROLES[c.info!.role] ?? c.info!.role} · {new Date(c.createdAt).toLocaleDateString()}
            </span>
          </div>
        ))}
      </section>
      {isMe && (
        <p className="muted" style={{ fontSize: 13 }}>
          Only you can see your scores. To use this profile on another device, choose “Already have a profile?” there and
          enter @{user.handle} with your profile key.
        </p>
      )}
    </main>
  );
}
