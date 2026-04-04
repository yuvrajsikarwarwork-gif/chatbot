import { useMemo, useState } from "react";

import type { GlobalTrafficPoint } from "../../services/adminService";

type GlobalTrafficChartProps = {
  data: GlobalTrafficPoint[];
  loading?: boolean;
  timeWindowLabel?: string;
};

const WIDTH = 1000;
const HEIGHT = 320;
const PADDING_X = 44;
const PADDING_Y = 28;

function formatHourLabel(timestamp: string) {
  if (!timestamp) {
    return "";
  }

  const hour = timestamp.slice(11, 13);
  const day = timestamp.slice(8, 10);
  return `${day} ${hour}:00`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function GlobalTrafficChart({
  data,
  loading = false,
  timeWindowLabel = "Last 24h",
}: GlobalTrafficChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const chart = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const maxTotal = Math.max(...safeData.map((point) => Number(point.total || 0)), 1);
    const plotWidth = WIDTH - PADDING_X * 2;
    const plotHeight = HEIGHT - PADDING_Y * 2;
    const xStep = safeData.length > 1 ? plotWidth / (safeData.length - 1) : plotWidth;

    const points = safeData.map((point, index) => {
      const human = Number(point.human || 0);
      const machine = Number(point.machine || 0);
      const total = Math.max(human + machine, Number(point.total || 0));
      const x = PADDING_X + index * xStep;
      const yForValue = (value: number) => HEIGHT - PADDING_Y - (clamp(value / maxTotal, 0, 1) * plotHeight);
      return {
        ...point,
        human,
        machine,
        total,
        x,
        humanY: yForValue(human),
        totalY: yForValue(total),
      };
    });

    const buildAreaPath = (
      yAccessor: (point: (typeof points)[number]) => number,
      baselineAccessor: (point: (typeof points)[number]) => number
    ) => {
      if (points.length === 0) {
        return "";
      }

      const upperPath = points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${yAccessor(point)}`)
        .join(" ");
      const lowerPath = [...points]
        .reverse()
        .map((point) => `L ${point.x} ${baselineAccessor(point)}`)
        .join(" ");
      return `${upperPath} ${lowerPath} Z`;
    };

    const humanAreaPath = buildAreaPath(
      (point) => point.humanY,
      () => HEIGHT - PADDING_Y
    );
    const machineAreaPath = buildAreaPath(
      (point) => point.totalY,
      (point) => point.humanY
    );

    return {
      safeData,
      points,
      maxTotal,
      humanAreaPath,
      machineAreaPath,
      plotWidth,
      plotHeight,
    };
  }, [data]);

  const activePoint =
    hoverIndex !== null && hoverIndex >= 0 && hoverIndex < chart.points.length
      ? chart.points[hoverIndex]
      : null;

  return (
    <section className="rounded-[1.75rem] border border-border-main bg-surface shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-main px-6 py-5">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-text-muted">
            Platform heartbeat
          </div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-text-main">
            Global traffic signature
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
            Human traffic usually follows working hours. Machine traffic shows automation bursts and steady polling.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <LegendDot color="bg-violet-500" label="Machine (API)" />
          <LegendDot color="bg-sky-500" label="Human (Web)" />
          <div className="rounded-full border border-border-main bg-canvas px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
            {timeWindowLabel}
          </div>
        </div>
      </div>

      <div className="relative h-56 px-2 py-4 sm:px-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            Loading traffic series...
          </div>
        ) : chart.points.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            No traffic samples yet.
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="h-full w-full overflow-visible"
              onMouseLeave={() => setHoverIndex(null)}
              onMouseMove={(event) => {
                const target = event.currentTarget;
                const rect = target.getBoundingClientRect();
                const relativeX = ((event.clientX - rect.left) / rect.width) * WIDTH;
                const nearestIndex = chart.points.reduce((bestIndex, point, index) => {
                  const bestDistance = Math.abs(chart.points[bestIndex].x - relativeX);
                  const currentDistance = Math.abs(point.x - relativeX);
                  return currentDistance < bestDistance ? index : bestIndex;
                }, 0);
                setHoverIndex(nearestIndex);
              }}
            >
              <defs>
                <linearGradient id="humanFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.15" />
                </linearGradient>
                <linearGradient id="machineFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.65" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.18" />
                </linearGradient>
              </defs>

              {[0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = PADDING_Y + (1 - ratio) * chart.plotHeight;
                return (
                  <line
                    key={ratio}
                    x1={PADDING_X}
                    y1={y}
                    x2={WIDTH - PADDING_X}
                    y2={y}
                    stroke="#e5e7eb"
                    strokeDasharray="4 4"
                  />
                );
              })}

              <path d={chart.humanAreaPath} fill="url(#humanFill)" stroke="#0ea5e9" strokeWidth={2.5} />
              <path d={chart.machineAreaPath} fill="url(#machineFill)" stroke="#8b5cf6" strokeWidth={2.5} />

              {chart.points.map((point, index) => {
                const isActive = index === hoverIndex;
                return (
                  <g key={point.timestamp}>
                    <circle
                      cx={point.x}
                      cy={point.humanY}
                      r={isActive ? 4.5 : 3.25}
                      fill="#0ea5e9"
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                    <circle
                      cx={point.x}
                      cy={point.totalY}
                      r={isActive ? 4.5 : 3.25}
                      fill="#8b5cf6"
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  </g>
                );
              })}
            </svg>

            {activePoint ? (
              <div className="pointer-events-none absolute left-6 top-6 rounded-2xl border border-border-main bg-white/95 px-4 py-3 shadow-xl backdrop-blur">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                  {formatHourLabel(activePoint.timestamp)}
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-text-muted">Human</span>
                    <span className="font-mono font-bold text-primary">
                      {Number(activePoint.human || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-text-muted">Machine</span>
                    <span className="font-mono font-bold text-violet-600">
                      {Number(activePoint.machine || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-border-main pt-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                    <span>Total</span>
                    <span>{Number(activePoint.total || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">{label}</span>
    </div>
  );
}
