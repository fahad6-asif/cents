import "server-only";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Simulated "today" (YYYY-MM-DD). All business date logic uses this, never `new Date()`. */
export function simToday(): string {
  const value = process.env.SIM_TODAY ?? "2026-10-15";
  if (!ISO_DATE.test(value)) throw new Error("SIM_TODAY must be YYYY-MM-DD");
  return value;
}

export function demoUserName(): string {
  return process.env.DEMO_USER_NAME?.trim() || "Fahad";
}
