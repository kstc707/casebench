import Link from "next/link";
import { getProblemsForDashboard } from "../lib/problems";

export default async function DashboardPage() {
  const problems = await getProblemsForDashboard();

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1>Casebench</h1>
      <p>Practice the job before you have the job.</p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th style={{ padding: 8 }}>Title</th>
            <th style={{ padding: 8 }}>Role</th>
            <th style={{ padding: 8 }}>Type</th>
            <th style={{ padding: 8 }}>Difficulty</th>
            <th style={{ padding: 8 }}>Est. time</th>
          </tr>
        </thead>
        <tbody>
          {problems.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: 16, color: "#888" }}>
                No problems found under content/role-packs. Check the path and that each
                simulation.json / problem.json is valid JSON.
              </td>
            </tr>
          )}
          {problems.map((p) => (
            <tr key={p.slug} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>
                <Link href={`/problems/${p.slug}`}>{p.title}</Link>
              </td>
              <td style={{ padding: 8 }}>{p.role}</td>
              <td style={{ padding: 8 }}>{p.type}</td>
              <td style={{ padding: 8 }}>{p.difficulty}</td>
              <td style={{ padding: 8 }}>{p.estimatedMinutes} min</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
