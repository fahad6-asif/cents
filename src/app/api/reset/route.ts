import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { loadSessionData } from "@/lib/db/queries";
import { resetSession } from "@/lib/db/sessions";
import { loadWorthALook } from "@/lib/db/alerts-view";
import { buildOverview } from "@/lib/overview";
import { currentSession } from "@/lib/session";
import { demoUserName, simToday } from "@/lib/sim";

export async function POST() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });
  const db = getDb();
  const { epoch } = await resetSession(db, session.id, simToday());
  const [data, worth] = await Promise.all([loadSessionData(db, session.id), loadWorthALook(db, session.id)]);
  return NextResponse.json({ ok: true, epoch, overview: buildOverview(data, simToday(), "1M", demoUserName(), worth) });
}
