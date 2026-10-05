import Link from "next/link";
import { getCatalog } from "../lib/problems";
import { metaFor } from "../lib/community";
import { Discover, type DiscoverItem } from "../components/Discover";
import { Shell } from "../components/Shell";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const catalog = await getCatalog();
  const meta = process.env.DATABASE_URL ? await metaFor(catalog.map((c) => c.problem.slug)) : new Map();
  const items: DiscoverItem[] = catalog.flatMap(({ problem: p, source, authorName, createdAt }, index) => {
    const m = meta.get(p.slug);
    if (!m) return [];
    return [
      {
        key: `CASE-${index + 1}`,
        slug: p.slug,
        title: p.title,
        category: p.role,
        concepts: p.concepts.map((c) => c.name),
        source,
        authorName,
        createdAt,
        complexity: { score: m.complexity.score, label: m.complexity.label },
        expectedMinutes: m.complexity.expectedMinutes,
        attempts: m.stats.attempts,
        solvers: m.stats.solvers,
        attemptsLast7Days: m.stats.attemptsLast7Days,
        completionRate: m.stats.attempts ? Math.round((100 * m.stats.completions) / m.stats.attempts) : null,
        likes: m.social.likes,
        ratingAvg: m.social.ratingAvg,
        ratingCount: m.social.ratingCount,
      },
    ];
  });

  return (
    <Shell active="problems" crumbs={<strong>Problems</strong>}>
      <main className="page">
        <div className="list-head">
          <div>
            <h1>Problems</h1>
            <p className="muted" style={{ margin: "6px 0 0", maxWidth: 680 }}>
              Real work situations to step into. Join the team's workspace, work with AI coworkers who know different
              things, investigate the data, and hand in your answer. It's graded against what was actually true.
            </p>
          </div>
          <Link href="/studio">
            <button className="primary">+ New problem</button>
          </Link>
        </div>
        <Discover items={items} />
      </main>
    </Shell>
  );
}
