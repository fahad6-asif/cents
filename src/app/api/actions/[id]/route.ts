import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getAction } from "@/lib/engine/actions";
import { isUuid, jsonError } from "@/lib/http";
import { currentSession } from "@/lib/session";

export async function GET(_request: Request, ctx: RouteContext<"/api/actions/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Proposal not found");
  const session = await currentSession();
  if (!session) return jsonError(401, "No session");
  const proposal = await getAction(getDb(), session.id, id);
  if (!proposal) return jsonError(404, "Proposal not found");
  return NextResponse.json({ proposal }, { headers: { "Cache-Control": "no-store" } });
}
