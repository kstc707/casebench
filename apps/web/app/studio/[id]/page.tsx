import Link from "next/link";
import { ScenarioEditor } from "../../../components/studio/ScenarioEditor";
import { Shell } from "../../../components/Shell";

export const metadata = { title: "Edit problem · Casebench" };

export default async function EditScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Shell active="create" crumbs={<><Link href="/studio">Create</Link> / <strong>Editor</strong></>}>
      <ScenarioEditor id={id} />
    </Shell>
  );
}
