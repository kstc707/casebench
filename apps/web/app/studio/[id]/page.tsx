import { ScenarioEditor } from "../../../components/studio/ScenarioEditor";

export const metadata = { title: "Edit scenario · Casebench" };

export default async function EditScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ScenarioEditor id={id} />;
}
