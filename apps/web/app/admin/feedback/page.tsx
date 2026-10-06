import Link from "next/link";
import { FEEDBACK_PERSONAS, FEEDBACK_RATINGS, listFeedback, summarizeFeedback, type FeedbackRatingKey } from "@casebench/database";
import { getPool } from "../../../lib/db";
import { getProfile } from "../../../lib/session";
import { isAdmin } from "../../../lib/authorAgent";
import { Shell } from "../../../components/Shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feedback · Casebench" };

const COMPLETED = { yes: "Finished", partly: "Started", no: "Looked around" } as const;

/** Every feedback response, with averages on top. Admins only. */
export default async function FeedbackAdminPage() {
  const crumbs = <><Link href="/">Admin</Link> / <strong>Feedback</strong></>;
  if (!isAdmin(await getProfile())) {
    return (
      <Shell crumbs={crumbs}>
        <main className="page"><p className="muted">Admins only. Sign in with an admin profile.</p></main>
      </Shell>
    );
  }
  const rows = await listFeedback(getPool());
  const s = summarizeFeedback(rows);
  const pct = (n: number) => (s.responses ? Math.round((100 * n) / s.responses) : 0);

  return (
    <Shell active="admin-feedback" crumbs={crumbs}>
      <main className="page">
        <div className="list-head">
          <div>
            <h1>Feedback</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              {s.responses} response{s.responses === 1 ? "" : "s"}. Share <Link href="/feedback">/feedback</Link> with testers.
            </p>
          </div>
          <a href="/api/feedback" download="casebench-feedback.json"><button>Download JSON</button></a>
        </div>

        {s.responses > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, margin: "20px 0" }}>
            <section className="card">
              <h3 style={{ marginTop: 0 }}>Average ratings (1–5)</h3>
              {(Object.keys(FEEDBACK_RATINGS) as FeedbackRatingKey[]).map((k) => (
                <div key={k} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>{FEEDBACK_RATINGS[k]}</span>
                    <strong>{s.ratings[k].avg ?? "–"}</strong>
                  </div>
                  <div className="fb-bar"><span style={{ width: `${((s.ratings[k].avg ?? 0) / 5) * 100}%` }} /></div>
                  <span className="muted" style={{ fontSize: 12 }}>{s.ratings[k].count} answered</span>
                </div>
              ))}
            </section>
            <section className="card">
              <h3 style={{ marginTop: 0 }}>Would use it to prepare</h3>
              {(["yes", "maybe", "no"] as const).map((k) => (
                <p key={k} style={{ margin: "4px 0" }}>
                  {k[0].toUpperCase() + k.slice(1)}: <strong>{s.wouldUse[k]}</strong> <span className="muted">({pct(s.wouldUse[k])}%)</span>
                </p>
              ))}
              <h3>Who answered</h3>
              {Object.entries(s.personas).map(([k, n]) => (
                <p key={k} style={{ margin: "4px 0" }}>
                  {FEEDBACK_PERSONAS[k as keyof typeof FEEDBACK_PERSONAS]}: <strong>{n}</strong>
                </p>
              ))}
            </section>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r) => (
            <article key={r.id} className="card">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className="pill">{FEEDBACK_PERSONAS[r.persona]}</span>
                <span className="pill">{COMPLETED[r.completed]}</span>
                <span className="pill">Would use: {r.wouldUse}</span>
                {r.problemSlug && <Link className="pill" href={`/problems/${r.problemSlug}`}>{r.problemSlug}</Link>}
                <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>{new Date(r.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              <p style={{ margin: "10px 0", fontSize: 14 }}>
                {(Object.keys(FEEDBACK_RATINGS) as FeedbackRatingKey[])
                  .filter((k) => r.ratings[k])
                  .map((k) => `${FEEDBACK_RATINGS[k]}: ${r.ratings[k]}`)
                  .join(" · ")}
              </p>
              {r.mostUseful && <p style={{ margin: "6px 0" }}><strong>Most useful:</strong> {r.mostUseful}</p>}
              {r.confusing && <p style={{ margin: "6px 0" }}><strong>Confusing / broken:</strong> {r.confusing}</p>}
              {r.missing && <p style={{ margin: "6px 0" }}><strong>Missing:</strong> {r.missing}</p>}
              {r.contact && <p className="muted" style={{ margin: "6px 0 0" }}>Contact: {r.contact}</p>}
            </article>
          ))}
        </div>
      </main>
    </Shell>
  );
}
