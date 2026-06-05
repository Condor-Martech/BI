"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ChartSpec } from "@/lib/api/endpoints/analysis";

/**
 * Renders a ChartSpec emitted by the LLM. The data is embedded in the spec, so
 * this is a pure presentational map: spec.type → recharts chart. Colors use theme
 * CSS variables so it follows light/dark mode.
 */

const PALETTE = [
  "var(--primary)",
  "var(--twenty-orange, oklch(0.75 0.16 60))",
  "var(--success, oklch(0.65 0.17 152))",
  "var(--destructive, oklch(0.6 0.22 27))",
  "oklch(0.62 0.19 295)",
  "oklch(0.62 0.16 245)",
];

const axisProps = {
  tick: { fontSize: 11, fill: "var(--muted-foreground)" },
  stroke: "var(--border)",
} as const;

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--popover-foreground)",
  },
  labelStyle: { color: "var(--foreground)" },
} as const;

export function AnalysisChart({ spec }: { spec: ChartSpec }) {
  const { title, type, data, xKey, series } = spec;

  if (!data || data.length === 0 || series.length === 0) {
    return null;
  }

  return (
    <figure className="my-3 rounded-lg border border-border bg-card p-3">
      <figcaption className="mb-2 text-xs font-medium text-foreground">{title}</figcaption>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(type, data, xKey, series)}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function renderChart(
  type: ChartSpec["type"],
  data: ChartSpec["data"],
  xKey: string,
  series: ChartSpec["series"],
) {
  if (type === "pie") {
    const valueKey = series[0]?.key;
    if (!valueKey) return <div />;
    return (
      <PieChart>
        <Tooltip {...tooltipStyle} />
        <Pie data={data} dataKey={valueKey} nameKey={xKey} outerRadius="80%" label>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    );
  }

  if (type === "line") {
    return (
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey={xKey} {...axisProps} />
        <YAxis {...axisProps} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label ?? s.key}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    );
  }

  if (type === "area") {
    return (
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey={xKey} {...axisProps} />
        <YAxis {...axisProps} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label ?? s.key}
            stroke={PALETTE[i % PALETTE.length]}
            fill={PALETTE[i % PALETTE.length]}
            fillOpacity={0.2}
          />
        ))}
      </AreaChart>
    );
  }

  // default: bar
  return (
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey={xKey} {...axisProps} />
      <YAxis {...axisProps} />
      <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      {series.map((s, i) => (
        <Bar key={s.key} dataKey={s.key} name={s.label ?? s.key} fill={PALETTE[i % PALETTE.length]} radius={[3, 3, 0, 0]} />
      ))}
    </BarChart>
  );
}
