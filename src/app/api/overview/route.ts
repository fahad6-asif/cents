import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { loadWorthALook } from "@/lib/db/alerts-view";
import { loadSessionData } from "@/lib/db/queries";
import { buildOverview } from "@/lib/overview";
import { RANGE_KEYS } from "@/lib/overview-types";
import { currentSession } from "@/lib/session";
import { demoUserName, simToday } from "@/lib/sim";

const Query = z.object({ range: z.enum(RANGE_KEYS).default("1M") }).strict();

export async function GET(request: NextRequest) {
  const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query", issues: parsed.error.issues }, { status: 400 });

  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const db = getDb();
  const [data, worth] = await Promise.all([loadSessionData(db, session.id), loadWorthALook(db, session.id)]);
  return NextResponse.json(buildOverview(data, simToday(), parsed.data.range, demoUserName(), worth), {
    headers: { "Cache-Control": "no-store" },
  });
}
