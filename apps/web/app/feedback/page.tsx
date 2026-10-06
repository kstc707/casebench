import Link from "next/link";
import { FEEDBACK_PERSONAS, FEEDBACK_RATINGS } from "@casebench/database";
import { getCatalog } from "../../lib/problems";
import { Shell } from "../../components/Shell";
import { FeedbackForm } from "../../components/FeedbackForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Give feedback · Casebench" };

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ problem?: string }> }) {
  const { problem } = await searchParams;
  const problems = (await getCatalog()).map(({ problem: p }) => ({ slug: p.slug, title: p.title }));
  return (
    <Shell active="feedback" crumbs={<><Link href="/">Casebench</Link> / <strong>Feedback</strong></>}>
      <main className="page" style={{ maxWidth: 720 }}>
        <h1>Tell me what you think</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          About 3 minutes. Every answer is read. Skip any question that doesn't apply.
        </p>
        <FeedbackForm
          personas={FEEDBACK_PERSONAS}
          ratings={FEEDBACK_RATINGS}
          problems={problems}
          initialProblem={problems.some((p) => p.slug === problem) ? problem! : ""}
        />
      </main>
    </Shell>
  );
}
