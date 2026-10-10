import Link from "next/link";
import { listPracticeTasks } from "../../lib/practice/tasks";
import { sizeLabel } from "../../lib/practice/types";
import { Shell } from "../../components/Shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Practice · Casebench" };

export default async function PracticePage() {
  const tasks = await listPracticeTasks();
  return (
    <Shell active="practice" crumbs={<strong>Practice</strong>}>
      <main className="page">
        <div className="list-head">
          <div>
            <h1>Practice: real bugs from open source</h1>
            <p className="muted" style={{ margin: "6px 0 0", maxWidth: 700 }}>
              Each task is a real bug that was fixed in an open-source Python project. You get the code as it was before
              the fix and the project's own tests. Make the failing tests pass without breaking the others. Everything
              runs in your browser.
            </p>
          </div>
        </div>
        <div className="issues">
          {tasks.length === 0 && <p className="muted" style={{ padding: "12px 14px", margin: 0 }}>No practice tasks yet.</p>}
          {tasks.map((t, i) => {
            const size = sizeLabel(t.fixSize);
            return (
              <Link key={t.slug} href={`/practice/${t.slug}`} className="issue-row" style={{ gridTemplateColumns: "70px minmax(0,1fr) auto" }}>
                <span className="issue-key">PY-{i + 1}</span>
                <span>
                  <div className="issue-title">{t.title}</div>
                  <div className="issue-meta">
                    <span className="pill">{t.project.name}</span>
                    <span>
                      {t.failToPass.length} failing test{t.failToPass.length === 1 ? "" : "s"} to fix · {t.passToPassCount} to keep passing
                    </span>
                    <span>· edit {t.editable.map((f) => f.split("/").pop()).join(", ")}</span>
                  </div>
                </span>
                <span style={{ color: size.color, fontWeight: 600, whiteSpace: "nowrap" }}>{size.label}</span>
              </Link>
            );
          })}
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
          Tasks come from projects' public history and keep their original licenses. Fixing a task here doesn't send
          anything to the project.
        </p>
      </main>
    </Shell>
  );
}
