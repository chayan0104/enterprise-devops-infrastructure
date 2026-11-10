import { getRunbooks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? undefined;
    const category = url.searchParams.get("category") ?? undefined;
    const rows = await getRunbooks({ q, category });
    return Response.json({ count: rows.length, runbooks: rows });
  } catch (error) {
    console.error("GET /api/runbook failed", error);
    return Response.json({ error: "Unable to search the runbook" }, { status: 500 });
  }
}
