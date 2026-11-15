"use client";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend, LineChart, Line } from "recharts";
import { brl } from "@/lib/format";

const PALETTE = ["#D91E3A", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#06B6D4", "#F97316", "#6B7280"];
const tooltipStyle = { contentStyle: { background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 12, fontSize: 12, color: "rgb(var(--fg))" }, labelStyle: { color: "rgb(var(--muted))" }, cursor: { fill: "rgb(var(--line) / 0.4)" } };
const axis = { tick: { fontSize: 11, fill: "rgb(var(--muted))" }, axisLine: false, tickLine: false } as const;
const compact = (v: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(v);

export function AreaMoney({ data, x = "label", keys, height = 260 }: { data: Record<string, unknown>[]; x?: string; keys: { key: string; name: string; color?: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>{keys.map((k, i) => <linearGradient key={k.key} id={`g-${k.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={k.color ?? PALETTE[i]} stopOpacity={0.35} /><stop offset="100%" stopColor={k.color ?? PALETTE[i]} stopOpacity={0} /></linearGradient>)}</defs>
        <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
        <XAxis dataKey={x} {...axis} /><YAxis {...axis} tickFormatter={compact} width={44} />
        <Tooltip {...tooltipStyle} formatter={(v) => brl(Number(v))} />
        {keys.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
        {keys.map((k, i) => <Area key={k.key} type="monotone" dataKey={k.key} name={k.name} stroke={k.color ?? PALETTE[i]} strokeWidth={2} fill={`url(#g-${k.key})`} />)}
      </AreaChart>
    </ResponsiveContainer>
  );
}
export function Bars({ data, x = "label", keys, height = 260, money, stacked, horizontal }: { data: Record<string, unknown>[]; x?: string; keys: { key: string; name: string; color?: string }[]; height?: number; money?: boolean; stacked?: boolean; horizontal?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={!horizontal} horizontal={!!horizontal === false} stroke="rgb(var(--line))" />
        {horizontal ? <><XAxis type="number" {...axis} tickFormatter={money ? compact : undefined} /><YAxis type="category" dataKey={x} {...axis} width={110} /></> : <><XAxis dataKey={x} {...axis} /><YAxis {...axis} tickFormatter={money ? compact : undefined} width={44} /></>}
        <Tooltip {...tooltipStyle} formatter={(v) => (money ? brl(Number(v)) : v)} />
        {keys.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
        {keys.map((k, i) => <Bar key={k.key} dataKey={k.key} name={k.name} fill={k.color ?? PALETTE[i]} radius={[6, 6, 0, 0]} stackId={stacked ? "s" : undefined} maxBarSize={42} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}
export function Donut({ data, height = 240 }: { data: { name: string; value: number }[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="85%" paddingAngle={2} stroke="none">{data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie>
        <Tooltip {...tooltipStyle} formatter={(v) => `${v} (${total ? Math.round((Number(v) / total) * 100) : 0}%)`} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} layout="vertical" align="right" verticalAlign="middle" />
      </PieChart>
    </ResponsiveContainer>
  );
}
export function Lines({ data, x = "label", keys, height = 260, pctAxis }: { data: Record<string, unknown>[]; x?: string; keys: { key: string; name: string; color?: string }[]; height?: number; pctAxis?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
        <XAxis dataKey={x} {...axis} /><YAxis {...axis} width={40} tickFormatter={pctAxis ? (v) => `${v}%` : undefined} />
        <Tooltip {...tooltipStyle} formatter={(v) => (pctAxis ? `${Number(v).toFixed(1)}%` : v)} />
        {keys.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
        {keys.map((k, i) => <Line key={k.key} type="monotone" dataKey={k.key} name={k.name} stroke={k.color ?? PALETTE[i]} strokeWidth={2} dot={{ r: 3 }} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}
