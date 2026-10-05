import { notFound } from "next/navigation";
import { getProblemBySlug, getPublicPersonas, getRubricLabels } from "../../../lib/problems";
import { Workspace } from "../../../components/Workspace";

export const dynamic = "force-dynamic";

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const problem = await getProblemBySlug(slug);
  if (!problem) return notFound();
  if (problem.type !== "case-study") {
    return (
      <main className="page">
        <h1>{problem.title}</h1>
        <p className="muted">The coding track hasn't been ported from the prototype yet.</p>
      </main>
    );
  }
  // Only client-safe data crosses this line: the problem without its truth
  // model, and personas without their knowledge or prompts.
  return (
    <Workspace
      problem={problem}
      personas={await getPublicPersonas(slug)}
      labels={await getRubricLabels(slug)}
    />
  );
}
