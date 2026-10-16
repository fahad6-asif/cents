import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { loadSessionData } from "@/lib/db/queries";
import { jsonError } from "@/lib/http";
import { currentSession } from "@/lib/session";
import { simToday } from "@/lib/sim";
import { billsView } from "@/lib/views";

export async function GET() {
  const session = await currentSession();
  if (!session) return jsonError(401, "No session");
  const data = await loadSessionData(getDb(), session.id);
  return NextResponse.json(billsView(data, simToday()), { headers: { "Cache-Control": "no-store" } });
}
