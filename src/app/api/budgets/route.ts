import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { loadSessionData } from "@/lib/db/queries";
import { budgetStatuses } from "@/lib/domain/budgets";
import { monthOf } from "@/lib/domain/dates";
import { jsonError } from "@/lib/http";
import { currentSession } from "@/lib/session";
import { simToday } from "@/lib/sim";

const Query = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }).strict();

/** Budgets + utilization for a month (default: the current simulated month). */
export async function GET(request: NextRequest) {
  const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return jsonError(400, "Invalid query");
  const session = await currentSession();
  if (!session) return jsonError(401, "No session");
  const today = simToday();
  const month = parsed.data.month ?? monthOf(today);
  const data = await loadSessionData(getDb(), session.id);
  return NextResponse.json(
    { month, today, budgets: budgetStatuses(data.budgets, data.txs, month, today) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
