import Link from "next/link";
import { AgentConsole } from "../../../components/AgentConsole";
import { Shell } from "../../../components/Shell";

export const metadata = { title: "Author agent · Casebench" };

export default function AgentPage() {
  return (
    <Shell active="agent" crumbs={<><Link href="/">Admin</Link> / <strong>Author agent</strong></>}>
      <AgentConsole />
    </Shell>
  );
}
