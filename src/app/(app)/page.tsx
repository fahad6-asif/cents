import { OverviewView } from "@/components/dashboard/overview-view";
import { getDb } from "@/lib/db/client";
import { loadWorthALook } from "@/lib/db/alerts-view";
import { loadSessionData } from "@/lib/db/queries";
import { buildOverview } from "@/lib/overview";
import { currentSession } from "@/lib/session";
import { demoUserName, simToday } from "@/lib/sim";

export default async function OverviewPage() {
  const session = await currentSession();
  if (!session) throw new Error("Missing session");
  const db = getDb();
  const [data, worth] = await Promise.all([loadSessionData(db, session.id), loadWorthALook(db, session.id)]);
  return <OverviewView initial={buildOverview(data, simToday(), "1M", demoUserName(), worth)} />;
}
