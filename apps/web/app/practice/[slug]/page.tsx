import Link from "next/link";
import { notFound } from "next/navigation";
import { getPracticeTask } from "../../../lib/practice/tasks";
import { Shell } from "../../../components/Shell";
import { PracticeWorkspace } from "../../../components/practice/PracticeWorkspace";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const task = await getPracticeTask((await params).slug);
  return { title: task ? `${task.title} · Practice · Casebench` : "Practice · Casebench" };
}

/** One practice task: the bug, the code, the tests. The code and tests run in the browser. */
export default async function PracticeTaskPage({ params }: { params: Promise<{ slug: string }> }) {
  const task = await getPracticeTask((await params).slug);
  if (!task) notFound();
  return (
    <Shell
      active="practice"
      crumbs={
        <>
          <Link href="/practice">Practice</Link> / <strong>{task.title}</strong>
        </>
      }
    >
      <PracticeWorkspace task={task} />
    </Shell>
  );
}
