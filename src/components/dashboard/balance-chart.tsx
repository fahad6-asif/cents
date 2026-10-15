"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { formatUSD } from "@/lib/domain/money";
import type { SeriesPoint } from "@/lib/overview-types";

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: SeriesPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-[9px] border border-line bg-surface px-3 py-2 text-[12px] shadow-sm">
      <div className="text-text-muted">{p.label}</div>
      <div className="tabular font-medium text-text">{formatUSD(p.balanceCents)}</div>
    </div>
  );
}

export function BalanceChart({ points }: { points: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 1, right: 0, bottom: 1, left: 0 }}>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--line)", strokeWidth: 1 }} />
        <Line
          type="linear"
          dataKey="balanceCents"
          stroke="var(--brand)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, fill: "var(--brand)", stroke: "var(--surface)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
