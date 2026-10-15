import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { dismissAlert } from "@/lib/engine/dismiss";
import { isUuid, jsonError } from "@/lib/http";
import { currentSession } from "@/lib/session";

export async function POST(_request: Request, ctx: RouteContext<"/api/alerts/[id]/dismiss">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Alert not found");
  const session = await currentSession();
  if (!session) return jsonError(401, "No session");

  const outcome = await dismissAlert(getDb(), session.id, session.epoch, id);
  if (outcome.status === "not_found") return jsonError(404, "Alert not found");
  if (outcome.status === "not_active") return jsonError(409, `Alert is already ${outcome.current}`);
  return NextResponse.json({ ok: true, ...outcome });
}
