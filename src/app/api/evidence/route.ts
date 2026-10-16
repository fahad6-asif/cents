import { NextResponse } from "next/server";
import { exportEvidence } from "@/lib/db/activity";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http";
import { currentSession } from "@/lib/session";

/** JSON export of this session's audit log, tool calls, proposals and alerts (download). */
export async function GET() {
  const session = await currentSession();
  if (!session) return jsonError(401, "No session");
  const body = await exportEvidence(getDb(), session.id);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="cents-evidence-${session.id.slice(0, 8)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
