import type { UsedBar } from '../types';
import type { Units } from '../lib/units';
import { formatValue } from '../lib/units';

interface Props {
  bar: UsedBar;
  units: Units;
  showLabels: boolean;
}

const BAR_HEIGHT = 52;
const MAX_W = 520;

export function LinearDiagram({ bar, units, showLabels }: Props) {
  const { stockLength, segments, wasteLength, wastePercent, barNum } = bar;
  if (!stockLength) return null;

  const scale = Math.min(MAX_W / stockLength, 1);
  const dispW = stockLength * scale;
  const ul = units === 'metric' ? 'mm' : 'in';

  let cursor = 0;

  return (
    <div className="mb-5" data-result={JSON.stringify({ type: 'linear', barNum, stockLength, wastePercent: wastePercent.toFixed(1), segmentCount: segments.length })}>
      <div className="flex items-center justify-between mb-1.5 px-1">
        <span className="text-sm font-medium text-foreground">
          Bar {barNum}
          {bar.material && <span className="ml-2 text-xs text-muted-foreground">({bar.material})</span>}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatValue(stockLength, units, 0)} {ul} — waste: {wastePercent.toFixed(1)}%
        </span>
      </div>
      <div className="overflow-auto">
        <svg
          width={dispW}
          height={BAR_HEIGHT}
          viewBox={`0 0 ${dispW} ${BAR_HEIGHT}`}
          style={{ display: 'block', border: '1px solid hsl(var(--border))' }}
        >
          {segments.map((seg, si) => {
            const x = cursor * scale;
            const w = seg.length * scale;
            const mid = x + w / 2;
            cursor += seg.length;

            const dimFontSize = Math.min(10, w / 4);
            const showDim = w > 20 && dimFontSize >= 5;
            const hasLabel = showLabels && !!seg.label && w > 30;
            const dimY = hasLabel ? BAR_HEIGHT / 2 + 8 : BAR_HEIGHT / 2;

            return (
              <g key={si}>
                <rect x={x} y={0} width={w} height={BAR_HEIGHT} fill={seg.color} fillOpacity={0.85} stroke="white" strokeWidth={0.5} />

                {/* User label — only when showLabels */}
                {hasLabel && (
                  <text
                    x={mid}
                    y={BAR_HEIGHT / 2 - 7}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize={Math.min(10, w / 5)}
                    fontWeight="600"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {seg.label.length > 10 ? seg.label.slice(0, 10) + '…' : seg.label}
                  </text>
                )}

                {/* Piece length — always shown when large enough */}
                {showDim && (
                  <text
                    x={mid}
                    y={dimY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="rgba(255,255,255,0.95)"
                    fontSize={dimFontSize}
                    fontWeight="500"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {formatValue(seg.length, units, 0)} {ul}
                  </text>
                )}
              </g>
            );
          })}

          {/* Waste tail */}
          {wasteLength > 0 && (() => {
            const wasteX = cursor * scale;
            const wasteW = wasteLength * scale;
            const wasteMid = wasteX + wasteW / 2;
            const wasteDimFontSize = Math.min(10, wasteW / 4);
            const showWasteSize = wasteW > 30 && wasteDimFontSize >= 5;

            return (
              <g>
                <rect
                  x={wasteX}
                  y={0}
                  width={wasteW}
                  height={BAR_HEIGHT}
                  fill="#d6ccbc"
                  stroke="white"
                  strokeWidth={0.5}
                />
                {showWasteSize && (
                  <>
                    <text
                      x={wasteMid}
                      y={BAR_HEIGHT / 2 - 7}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#8a7a6a"
                      fontSize={Math.min(9, wasteW / 6)}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      remaining
                    </text>
                    <text
                      x={wasteMid}
                      y={BAR_HEIGHT / 2 + 6}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#6b5e50"
                      fontSize={wasteDimFontSize}
                      fontWeight="600"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {formatValue(wasteLength, units, 0)} {ul}
                    </text>
                  </>
                )}
                {!showWasteSize && wasteW > 14 && (
                  <text
                    x={wasteMid}
                    y={BAR_HEIGHT / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#8a7a6a"
                    fontSize={7}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    ~{formatValue(wasteLength, units, 0)}
                  </text>
                )}
              </g>
            );
          })()}

          <rect x={0} y={0} width={dispW} height={BAR_HEIGHT} fill="none" stroke="#8a7a6a" strokeWidth={1} />
        </svg>
      </div>
    </div>
  );
}
