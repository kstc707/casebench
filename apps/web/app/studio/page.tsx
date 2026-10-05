import Link from "next/link";
import { StudioHome } from "../../components/studio/StudioHome";
import { Shell } from "../../components/Shell";

export const metadata = { title: "Create · Casebench" };

export default function StudioPage() {
  return (
    <Shell active="create" crumbs={<><Link href="/">Problems</Link> / <strong>Create</strong></>}>
      <StudioHome />
    </Shell>
  );
}
