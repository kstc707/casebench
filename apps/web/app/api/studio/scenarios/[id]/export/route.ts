import { getPool, getScenarioForAuthor, ScenarioNotFoundError } from "../../../../../../lib/db";
import { getUserId } from "../../../../../../lib/session";
import { handleRouteError, jsonError, runIdFrom } from "../../../../../../lib/api";

export const dynamic = "force-dynamic";

/**
 * GET — download the scenario as one JSON file (author only). Share it with
 * someone else to import, or turn it into official content with
 * `pnpm --filter @casebench/content-tools import-scenario <file>`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const id = await runIdFrom(params);
    if (!id) return jsonError(404, "Scenario not found");
    const s = await getScenarioForAuthor(getPool(), id, await getUserId());
    return new Response(JSON.stringify(s.bundle, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${s.slug}.scenario.json"`,
      },
    });
  } catch (err) {
    if (err instanceof ScenarioNotFoundError) return jsonError(404, "Scenario not found");
    return handleRouteError(err);
  }
}
