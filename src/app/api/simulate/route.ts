import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { loadWorthALook } from "@/lib/db/alerts-view";
import { loadSessionData } from "@/lib/db/queries";
import { MAX_CUSTOM_PER_HOUR, simulateEvent, type SimulateSpec } from "@/lib/engine/simulate";
import { jsonError, readJson } from "@/lib/http";
import { buildOverview } from "@/lib/overview";
import { currentSession } from "@/lib/session";
import { demoUserName, simToday } from "@/lib/sim";
import type { SimEventId } from "@/lib/sim-events";
import { SimulateBody } from "@/lib/simulate-schema";

export async function POST(request: Request) {
  const body = await readJson(request, SimulateBody);
  if (!body.ok) return body.response;
  const session = await currentSession();
  if (!session) return jsonError(401, "No session");

  const db = getDb();
  const today = simToday();
  // Simulated "today" + the real wall-clock time of day (plan Section 6).
  const timeOfDay = new Date().toISOString().slice(11, 23);
  const result = await simulateEvent(db, {
    sessionId: session.id,
    epoch: session.epoch,
    spec: specOf(body.data),
    idempotencyKey: body.data.idempotencyKey,
    today,
    timeOfDay,
  });

  if (result.rateLimited) {
    return jsonError(429, `You can add up to ${MAX_CUSTOM_PER_HOUR} custom transactions per hour. Try again later.`, { scope: "custom" });
  }
  if (result.limited) {
    return jsonError(429, "This demo session has reached its limit of simulated transactions. Reset the demo to start over.");
  }

  const [data, worth] = await Promise.all([loadSessionData(db, session.id), loadWorthALook(db, session.id)]);
  return NextResponse.json(
    {
      replayed: result.replayed,
      transaction: result.transaction,
      paidBillId: result.paidBillId,
      alerts: result.checks && {
        created: result.checks.created,
        resolved: result.checks.resolved,
        updated: result.checks.updated,
      },
      proposals: { stale: result.staleProposals },
      overview: buildOverview(data, today, "1M", demoUserName(), worth),
    },
    { status: result.replayed ? 200 : 201, headers: { "Cache-Control": "no-store" } },
  );
}

function specOf(b: ReturnType<typeof SimulateBody.parse>): SimulateSpec {
  if (b.kind === "preset") return { kind: "preset", eventId: b.eventId as SimEventId };
  return { kind: "custom", type: b.type, category: b.category, amountCents: b.amountCents, merchant: b.merchant };
}
