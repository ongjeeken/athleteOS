import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { addDays, fmt } from "../domain/dates";
import { dailyLoad, weeklyLoad, plannedLoad } from "../domain/analytics";
import type { Data } from "../domain/models";
export const categoryColors: Record<string, string> = {
  Fencing: "#4b8068",
  Strength: "#668bb3",
  Conditioning: "#c29445",
  Mobility: "#9b83af",
  Competition: "#c27464",
  Other: "#7a8b86",
};
export function LoadChart({
  data,
  date,
  days = 42,
  weekly = false,
  showPlanned = false,
}: {
  data: Data;
  date: string;
  days?: number;
  weekly?: boolean;
  showPlanned?: boolean;
}) {
  const start = addDays(date, 1 - days);
  const points: {
    date: string;
    label: string;
    load: number | null;
    count: number;
    missing: number;
    days?: number;
    planned?: number | null;
  }[] = weekly
    ? weeklyLoad(data.sessions, date, 6).map((v) => ({
        ...v,
        label: fmt(v.date),
      }))
    : dailyLoad(data.sessions, start, days).map((v) => ({
        ...v,
        label: fmt(v.date),
        planned: plannedLoad(data.plans.filter((p) => p.date === v.date)),
      }));
  return (
    <>
      <div
        className="chart-container"
        role="img"
        aria-label={
          weekly
            ? "Weekly recorded session load for six calendar weeks"
            : "Daily recorded and planned session load in arbitrary units"
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          {weekly ? (
            <BarChart
              data={points}
              margin={{ left: -15, right: 12, top: 15, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--line)"
                strokeDasharray="3 5"
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                }}
              />
              <Bar
                isAnimationActive={false}
                dataKey="load"
                name="Recorded load (AU)"
                fill="#4b8068"
                radius={[5, 5, 0, 0]}
                maxBarSize={45}
              />
            </BarChart>
          ) : (
            <AreaChart
              data={points}
              margin={{ left: -15, right: 12, top: 15, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--line)"
                strokeDasharray="3 5"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => fmt(v)}
                minTickGap={35}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
              />
              <Tooltip
                labelFormatter={(l) => fmt(String(l))}
                contentStyle={{
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                }}
              />
              <Area
                isAnimationActive={false}
                type="monotone"
                dataKey="load"
                name="Recorded load (AU)"
                stroke="#4b8068"
                strokeWidth={2}
                fill="#4b8068"
                fillOpacity={0.12}
                connectNulls={false}
              />
              {showPlanned && (
                <Area
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="planned"
                  name="Planned estimate (AU)"
                  stroke="#668bb3"
                  strokeDasharray="4 4"
                  fillOpacity={0}
                />
              )}
              {data.tournaments
                .filter((t) => t.startDate >= start && t.startDate <= date)
                .map((t) => (
                  <ReferenceLine
                    key={t.id}
                    x={t.startDate}
                    stroke="#c29445"
                    label={{
                      value: t.priority,
                      position: "insideTop",
                      fill: "var(--muted)",
                    }}
                  />
                ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
      <details className="chart-data">
        <summary>View chart data and calculation</summary>
        <p>
          AU = actual exercise minutes × session RPE. Only completed sessions
          contribute. Blank dates and missing RPE are unknown, not zero
          workload. Weeks start Monday. Partial totals are labeled below.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date / week</th>
                <th>Recorded AU</th>
                <th>Missing RPE</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date}>
                  <td>{fmt(p.date)}</td>
                  <td>{p.load ?? "Unknown"}</td>
                  <td>{p.missing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
export function RecoveryChart({
  data,
  date,
  days = 14,
}: {
  data: Data;
  date: string;
  days?: number;
}) {
  const points = Array.from({ length: days }, (_, i) => {
    const d = addDays(date, i + 1 - days),
      c = data.checkIns.find((c) => c.date === d);
    return {
      date: d,
      energy: c?.energy ?? null,
      fatigue: c?.fatigue ?? null,
      soreness: c?.soreness ?? null,
    };
  });
  return (
    <div
      className="chart-container"
      role="img"
      aria-label="Recovery trend: energy, fatigue, and soreness on a 1 to 5 scale"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ left: -25, right: 10, top: 15, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--line)"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => fmt(d)}
            minTickGap={35}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
          />
          <YAxis
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
          />
          <Tooltip
            labelFormatter={(d) => fmt(String(d))}
            contentStyle={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 10,
            }}
          />
          <Legend iconType="circle" iconSize={7} />
          <Line
            isAnimationActive={false}
            dataKey="energy"
            name="Energy"
            stroke="#4b8068"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
          />
          <Line
            isAnimationActive={false}
            dataKey="fatigue"
            name="Fatigue"
            stroke="#c29445"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
          />
          <Line
            isAnimationActive={false}
            dataKey="soreness"
            name="Soreness"
            stroke="#9b83af"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
