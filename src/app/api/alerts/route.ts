import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { listAlerts } from "@/lib/db/alerts-view";
import { jsonError } from "@/lib/http";
import { currentSession } from "@/lib/session";

export async function GET() {
  const session = await currentSession();
  if (!session) return jsonError(401, "No session");
  return NextResponse.json(await listAlerts(getDb(), session.id), { headers: { "Cache-Control": "no-store" } });
}
