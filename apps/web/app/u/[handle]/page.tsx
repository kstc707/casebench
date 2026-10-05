import Link from "next/link";
import { notFound } from "next/navigation";
import { createdBy, getUserByHandle, solvedBy } from "@casebench/database";
import { getPool } from "../../../lib/db";
import { getBundle } from "../../../lib/problems";
import { getProfile } from "../../../lib/session";
import { Face } from "../../../components/Profile";
import { Shell } from "../../../components/Shell";
import { RoleLabel } from "../../../components/Discover";

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
    <Shell
      active={isMe ? "profile" : undefined}
      crumbs={
        <>
          <Link href="/">People</Link> / <strong>@{user.handle}</strong>
        </>
      }
    >
      <main className="page">
        <div className="profile">
          <aside>
            <Face name={user.displayName} handle={user.handle} large />
            <h1>{user.displayName}</h1>
            <div className="muted">@{user.handle}</div>
            <div className="stat-row">
              <span><strong>{solvedRows.length}</strong> solved</span>
              <span><strong>{createdRows.length}</strong> created</span>
            </div>
            {isMe && (
              <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
                This is you. Only you can see your scores. To use this profile on another device, choose “Already have a
                profile?” there and enter @{user.handle} with your profile key.
              </p>
            )}
          </aside>
          <div style={{ display: "grid", gap: 24 }}>
            <section>
              <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Solved</h2>
              <div className="issues">
                {solvedRows.length === 0 && <p className="muted" style={{ padding: "12px 14px", margin: 0 }}>Nothing solved yet.</p>}
                {solvedRows.map((s) => (
                  <Link key={s.slug} href={`/problems/${s.slug}`} className="issue-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                    <span>
                      <div className="issue-title">{s.info!.title}</div>
                      <div className="issue-meta">
                        <RoleLabel role={s.info!.role} />
                        <span>Solved {new Date(s.firstSolvedAt).toLocaleDateString()}</span>
                        {s.attempts > 1 && <span>· {s.attempts} attempts</span>}
                      </div>
                    </span>
                    <span className="issue-num">{isMe && s.bestScore !== null ? `Best ${s.bestScore}/100` : "✓"}</span>
                  </Link>
                ))}
              </div>
            </section>
            <section>
              <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Created</h2>
              <div className="issues">
                {createdRows.length === 0 && <p className="muted" style={{ padding: "12px 14px", margin: 0 }}>No published problems yet.</p>}
                {createdRows.map((c) => (
                  <Link key={c.slug} href={`/problems/${c.slug}`} className="issue-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                    <span>
                      <div className="issue-title">{c.info!.title}</div>
                      <div className="issue-meta">
                        <RoleLabel role={c.info!.role} />
                        <span>Published {new Date(c.createdAt).toLocaleDateString()}</span>
                      </div>
                    </span>
                    <span />
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </Shell>
  );
}
