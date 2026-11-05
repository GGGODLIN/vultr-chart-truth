import type { CSSProperties, ReactNode } from 'react';
import { useId } from 'react';
import {
  CHART_FRAME,
  type ChartAxis,
  formatCompactMoney,
  formatMoney,
  type PlotBar,
  round1,
  yFor,
} from './audit-model.ts';

export type ChartMaterial = 'vault' | 'paper';

interface BarGlyphProps {
  bar: PlotBar;
  order: number;
  hatchId: string;
}

function BarGlyph({ bar, order, hatchId }: BarGlyphProps): ReactNode {
  const [firstLine, secondLine] = bar.lines;
  return (
    <g
      className="chart-bar"
      data-flagged={bar.flagged}
      style={{ '--i': order } as CSSProperties}
    >
      <title>{`${bar.category}: ${formatMoney(bar.value, bar.currency)}`}</title>
      <rect
        x={bar.x}
        y={bar.plotTop}
        width={bar.width}
        height={bar.plotHeight}
        fill={bar.flagged ? `url(#${hatchId})` : undefined}
      />
      {bar.ledgerY !== null ? (
        <line
          className="chart-ledger"
          x1={bar.x - 7}
          x2={bar.x + bar.width + 7}
          y1={bar.ledgerY}
          y2={bar.ledgerY}
        />
      ) : null}
      {bar.ledgerText !== null && bar.ledgerTextY !== null ? (
        <text className="chart-ledger-text" x={bar.labelX} y={bar.ledgerTextY} textAnchor="middle">
          {bar.ledgerText}
        </text>
      ) : null}
      {bar.valueText ? (
        <text className="chart-value" x={bar.labelX} y={bar.plotValueY} textAnchor="middle">
          {bar.valueText}
        </text>
      ) : null}
      {firstLine ? (
        <text
          className="chart-label"
          x={bar.labelX}
          y={secondLine ? 213 : 219}
          textAnchor="middle"
        >
          <tspan x={bar.labelX}>{firstLine}</tspan>
          {secondLine ? (
            <tspan x={bar.labelX} dy={12}>
              {secondLine}
            </tspan>
          ) : null}
        </text>
      ) : null}
    </g>
  );
}

export interface AuditChartProps {
  bars: readonly PlotBar[];
  axis: ChartAxis;
  currency: string;
  material: ChartMaterial;
  label: string;
}

export function AuditChart({ bars, axis, currency, material, label }: AuditChartProps): ReactNode {
  const uid = useId();
  const hatchId = `hatch-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      className="chart"
      data-material={material}
      viewBox={`0 0 ${CHART_FRAME.width} ${CHART_FRAME.height}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <pattern
          id={hatchId}
          width={7}
          height={7}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect className="chart-hatch-bg" width={7} height={7} />
          <line className="chart-hatch-line" x1={0} y1={0} x2={0} y2={7} />
        </pattern>
      </defs>
      <g className="chart-grid" aria-hidden="true">
        {axis.ticks.map((tick) => {
          const y = yFor(tick, axis);
          return (
            <g key={tick}>
              <line x1={CHART_FRAME.left} x2={CHART_FRAME.right} y1={y} y2={y} />
              <text x={CHART_FRAME.left - 7} y={round1(y + 3.5)} textAnchor="end">
                {formatCompactMoney(tick, currency)}
              </text>
            </g>
          );
        })}
      </g>
      {bars.map((bar, order) => (
        <BarGlyph key={bar.key} bar={bar} order={order} hatchId={hatchId} />
      ))}
      <line
        className="chart-base"
        x1={CHART_FRAME.left}
        x2={CHART_FRAME.right}
        y1={CHART_FRAME.baseline}
        y2={CHART_FRAME.baseline}
      />
    </svg>
  );
}
