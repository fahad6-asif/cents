import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { rejectAction } from "@/lib/engine/actions";
import { isUuid, jsonError } from "@/lib/http";
import { currentSession } from "@/lib/session";

export async function POST(_request: Request, ctx: RouteContext<"/api/actions/[id]/reject">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Proposal not found");
  const session = await currentSession();
  if (!session) return jsonError(401, "No session");

  const outcome = await rejectAction(getDb(), session.id, session.epoch, id);
  if (outcome.status === "not_found") return jsonError(404, "Proposal not found");
  if (outcome.status === "conflict") return jsonError(409, outcome.message, { reason: outcome.reason, proposal: outcome.proposal });
  return NextResponse.json({ ok: true, proposal: outcome.proposal });
}
