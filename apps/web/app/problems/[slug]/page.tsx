import { notFound } from "next/navigation";
import { getProblemBySlug } from "../../../lib/problems";
import { RunPanel } from "../../../components/RunPanel";

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const problem = await getProblemBySlug(slug);
  if (!problem) return notFound();

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1>{problem.title}</h1>
      <p>
        {problem.role} · {problem.type} · {problem.difficulty} · {problem.estimatedMinutes} min
      </p>

      <RunPanel problemSlug={problem.slug} />

      {problem.type === "case-study" ? (
        <section>
          <h2>Brief</h2>
          <p>{problem.brief}</p>
          <h2>Concepts you'll practice</h2>
          <ul>
            {problem.concepts.map((c) => (
              <li key={c.name}>
                <strong>{c.name}</strong> — {c.blurb}
              </li>
            ))}
          </ul>
          <p style={{ color: "#888" }}>
            TODO: data explorer / SQL sandbox, manager chat, and submission form — see the
            working prototype (prototype/casebench-demo.html) for the reference UX to port here.
          </p>
        </section>
      ) : (
        <section>
          <h2>Assignment</h2>
          <p>{problem.assignmentBrief}</p>
          <pre style={{ background: "#f5f5f5", padding: 12 }}>{problem.functionSignature}</pre>
          <p style={{ color: "#888" }}>
            TODO: code editor + deterministic test runner — see the working prototype for the
            reference UX to port here.
          </p>
        </section>
      )}
    </main>
  );
}
