import { useMemo, useState } from "react";

import type { OptimizationPerformancePoint } from "../../services/analyticsService";

type OptimizationImpactChartProps = {
  data: OptimizationPerformancePoint[];
  loading?: boolean;
  error?: string;
  title?: string;
};

type ChartPoint = OptimizationPerformancePoint & {
  failureRatePct: number;
  confidencePct: number;
};

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function buildPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function getPointCoordinates(
  index: number,
  total: number,
  chartWidth: number,
  chartHeight: number,
  padding: { top: number; right: number; bottom: number; left: number },
  value: number
) {
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const x = total > 1
    ? padding.left + (index / (total - 1)) * innerWidth
    : padding.left + innerWidth / 2;
  const clamped = Math.max(0, Math.min(100, value));
  const y = padding.top + innerHeight - (clamped / 100) * innerHeight;
  return { x, y };
}

export default function OptimizationImpactChart({
  data,
  loading = false,
  error,
  title = "Optimization Impact",
}: OptimizationImpactChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const chartData: ChartPoint[] = useMemo(
    () =>
      Array.isArray(data)
        ? data.map((row) => ({
            ...row,
            failureRatePct: Number(row.failureRate || 0) * 100,
            confidencePct: Number(row.confidenceScore || 0),
          }))
        : [],
    [data]
  );

  const chartWidth = 1000;
  const chartHeight = 340;
  const padding = { top: 22, right: 36, bottom: 44, left: 52 };
  const totalPoints = chartData.length;

  const failurePoints = chartData.map((row, index) =>
    getPointCoordinates(index, totalPoints, chartWidth, chartHeight, padding, row.failureRatePct)
  );
  const confidencePoints = chartData.map((row, index) =>
    getPointCoordinates(index, totalPoints, chartWidth, chartHeight, padding, row.confidencePct)
  );
  const activePoint =
    activeIndex !== null && activeIndex >= 0 && activeIndex < chartData.length
      ? {
          row: chartData[activeIndex],
          failure: failurePoints[activeIndex],
          confidence: confidencePoints[activeIndex],
        }
      : null;

  const yTicks = [0, 25, 50, 75, 100];

  return (
    <section className="rounded-[1.75rem] border border-border-main bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
            Visual Proof
          </div>
          <h2 className="mt-2 text-[1.25rem] font-semibold tracking-tight text-text-main">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Failure rate and confidence over time, with purple markers on days when fixes were resolved.
          </p>
        </div>
        <div className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-right">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
            Resolution days
          </div>
          <div className="mt-1 text-2xl font-black tracking-tight text-purple-700">
            {chartData.filter((row) => Array.isArray(row.resolutions) && row.resolutions.length > 0).length}
          </div>
        </div>
      </div>

      <div className="mt-6 h-[360px] w-full">
        {loading ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border-main bg-canvas text-sm text-text-muted">
            Loading performance trend...
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm text-rose-700">
            {error}
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border-main bg-canvas text-sm text-text-muted">
            No performance data available yet.
          </div>
        ) : (
          <div className="relative h-full w-full">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-full w-full overflow-visible">
              <defs>
                <linearGradient id="failureStroke" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="100%" stopColor="#f97316" />
                </linearGradient>
                <linearGradient id="confidenceStroke" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </linearGradient>
              </defs>

              {yTicks.map((tick) => {
                const y = padding.top + (chartHeight - padding.top - padding.bottom) * (1 - tick / 100);
                return (
                  <g key={`tick-${tick}`}>
                    <line
                      x1={padding.left}
                      x2={chartWidth - padding.right}
                      y1={y}
                      y2={y}
                      stroke="#ece7f5"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={padding.left - 10}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="#6b7280"
                    >
                      {tick}%
                    </text>
                  </g>
                );
              })}

              <path d={buildPath(failurePoints)} fill="none" stroke="url(#failureStroke)" strokeWidth="3" />
              <path d={buildPath(confidencePoints)} fill="none" stroke="url(#confidenceStroke)" strokeWidth="3" />

              {chartData.map((row, index) => {
                const failurePoint = failurePoints[index];
                const confidencePoint = confidencePoints[index];
                const hasResolution = Array.isArray(row.resolutions) && row.resolutions.length > 0;
                return (
                  <g key={`${row.date}-${index}`}>
                    <circle
                      cx={failurePoint.x}
                      cy={failurePoint.y}
                      r={hasResolution ? 5 : 3}
                      fill={hasResolution ? "#8b5cf6" : "#ef4444"}
                      stroke="#fff"
                      strokeWidth="2"
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseLeave={() => setActiveIndex((current) => (current === index ? null : current))}
                    />
                    <circle
                      cx={confidencePoint.x}
                      cy={confidencePoint.y}
                      r={3}
                      fill="#7c3aed"
                      stroke="#fff"
                      strokeWidth="1.5"
                    />
                    {hasResolution ? (
                      <path
                        d={`M${failurePoint.x},${failurePoint.y - 8} L${failurePoint.x + 8},${failurePoint.y} L${failurePoint.x},${failurePoint.y + 8} L${failurePoint.x - 8},${failurePoint.y} Z`}
                        fill="#8b5cf6"
                        stroke="#fff"
                        strokeWidth="1.5"
                      />
                    ) : null}
                    <text
                      x={failurePoint.x}
                      y={chartHeight - 14}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#6b7280"
                    >
                      {formatDateLabel(row.date)}
                    </text>
                  </g>
                );
              })}
            </svg>

            {activePoint ? (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
                style={{
                  left: `${(activePoint.failure.x / chartWidth) * 100}%`,
                  top: `${(activePoint.failure.y / chartHeight) * 100}%`,
                }}
              >
                <div className="min-w-[220px] rounded-xl border border-border-main bg-white p-3 text-[10px] shadow-2xl">
                  <div className="border-b border-border-main pb-2 font-black uppercase tracking-[0.18em] text-text-muted">
                    {formatDateLabel(activePoint.row.date)}
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="font-semibold text-rose-600">
                      Failure rate: {activePoint.row.failureRatePct.toFixed(1)}%
                    </div>
                    <div className="font-semibold text-violet-700">
                      Confidence: {activePoint.row.confidencePct.toFixed(1)}%
                    </div>
                    <div className="text-text-muted">Attempts: {activePoint.row.totalAttempts || 0}</div>
                  </div>

                  {activePoint.row.resolutions.length > 0 ? (
                    <div className="mt-3 border-t border-purple-100 pt-2">
                      <div className="mb-1 font-black uppercase tracking-[0.18em] text-purple-700">
                        Resolution notes
                      </div>
                      <div className="space-y-1.5">
                        {activePoint.row.resolutions.map((resolution, index) => (
                          <div
                            key={`${resolution.nodeId || "node"}-${index}`}
                            className="rounded-lg bg-purple-50 px-2.5 py-2 text-[10px] leading-4 text-purple-900"
                          >
                            <div className="font-black uppercase tracking-[0.16em] text-purple-600">
                              {resolution.nodeId || "node"}
                            </div>
                            <div className="mt-0.5 italic">
                              {resolution.note || "Resolved"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-text-muted">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                Failure rate
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
                Confidence
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-purple-600" />
                Resolution day
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

