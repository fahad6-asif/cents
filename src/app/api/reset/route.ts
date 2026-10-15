import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { resetSession } from "@/lib/db/sessions";
import { currentSession } from "@/lib/session";

export async function POST() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });
  const { epoch } = await resetSession(getDb(), session.id);
  return NextResponse.json({ ok: true, epoch });
}
