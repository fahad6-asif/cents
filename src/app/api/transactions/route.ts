import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { loadSessionData } from "@/lib/db/queries";
import { jsonError } from "@/lib/http";
import { currentSession } from "@/lib/session";
import { simToday } from "@/lib/sim";
import { transactionsView } from "@/lib/views";

const TxQuery = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    category: z.string().max(40).optional(),
    q: z.string().max(100).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const parsed = TxQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return jsonError(400, "Invalid query");
  const session = await currentSession();
  if (!session) return jsonError(401, "No session");
  const data = await loadSessionData(getDb(), session.id);
  return NextResponse.json(transactionsView(data, simToday(), parsed.data), { headers: { "Cache-Control": "no-store" } });
}
