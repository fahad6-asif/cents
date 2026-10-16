import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { approveAction } from "@/lib/engine/actions";
import { isUuid, jsonError } from "@/lib/http";
import { currentSession } from "@/lib/session";
import { simToday } from "@/lib/sim";

/** Atomic approve + execute (plan 7.4). Reachable only from a UI button; no AI tool calls this. */
export async function POST(_request: Request, ctx: RouteContext<"/api/actions/[id]/approve">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Proposal not found");
  const session = await currentSession();
  if (!session) return jsonError(401, "No session");

  const outcome = await approveAction(getDb(), session.id, session.epoch, id, simToday());
  if (outcome.status === "not_found") return jsonError(404, "Proposal not found");
  if (outcome.status === "conflict") return jsonError(409, outcome.message, { reason: outcome.reason, proposal: outcome.proposal });
  return NextResponse.json({ ok: true, proposal: outcome.proposal });
}
