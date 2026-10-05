import { readDataFile } from "@casebench/simulation-engine";
import { getBundle } from "../../../../../../lib/problems";
import { jsonError } from "../../../../../../lib/api";

/**
 * GET /api/problems/:slug/data/:file — one of the case study's CSVs.
 * Only files listed in the problem's dataFiles are served (see readDataFile),
 * so server-only files like analysis.json can never be fetched.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; file: string }> }
): Promise<Response> {
  const { slug, file } = await params;
  const bundle = await getBundle(slug);
  const text = bundle && (await readDataFile(bundle, file));
  if (!text) return jsonError(404, "File not found");
  return new Response(text, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
