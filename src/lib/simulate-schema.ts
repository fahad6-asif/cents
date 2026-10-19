// POST /api/simulate body (B1.1): a preset event or a custom transaction, as one discriminated union.
import { z } from "zod";
import { CATEGORIES } from "@/lib/domain/categories";
import { CUSTOM_MAX_CENTS, CUSTOM_MERCHANT_MAX, normalizeMerchant } from "@/lib/engine/simulate-rules";
import { SIM_EVENTS } from "@/lib/sim-events";

const Preset = z
  .object({
    kind: z.literal("preset"),
    eventId: z.enum(SIM_EVENTS.map((e) => e.id) as [string, ...string[]]),
    idempotencyKey: z.uuid(),
  })
  .strict();

const Custom = z
  .object({
    kind: z.literal("custom"),
    type: z.enum(["expense", "income"]),
    // Only spending categories: Savings and Income are not selectable (income is set by type).
    category: z.enum(CATEGORIES).optional(),
    // Positive integer cents; the server applies the sign.
    amountCents: z.number().int().min(1).max(CUSTOM_MAX_CENTS),
    merchant: z
      .string()
      .max(200)
      .transform(normalizeMerchant)
      .refine((m) => m.length <= CUSTOM_MERCHANT_MAX, `Merchant must be at most ${CUSTOM_MERCHANT_MAX} characters`)
      .optional(),
    idempotencyKey: z.uuid(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.type === "expense" && !v.category) ctx.addIssue({ code: "custom", path: ["category"], message: "Pick a category for an expense" });
    if (v.type === "income" && v.category) ctx.addIssue({ code: "custom", path: ["category"], message: "Income has no category" });
  });

/** A body with `eventId` and no `kind` is a preset (backward compatible with the original API). */
export const SimulateBody = z.preprocess(
  (v) => (v && typeof v === "object" && !Array.isArray(v) && !("kind" in v) && "eventId" in v ? { ...v, kind: "preset" } : v),
  z.discriminatedUnion("kind", [Preset, Custom]),
);
export type SimulateBodyInput = z.infer<typeof SimulateBody>;
