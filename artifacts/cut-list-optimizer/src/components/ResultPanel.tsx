import type { OptimizationResult } from '../types';
import type { Units } from '../lib/units';
import { SheetDiagram } from './SheetDiagram';
import { LinearDiagram } from './LinearDiagram';

interface Props {
  result: OptimizationResult | null;
  units: Units;
  showLabels: boolean;
}

export function ResultPanel({ result, units, showLabels }: Props) {
  if (!result) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white h-full min-h-[300px]">
        <div className="text-center text-muted-foreground">
          <div className="text-4xl mb-3 opacity-30">✂</div>
          <p className="text-sm">Enter your pieces and stock, then click <strong>Calculate</strong></p>
        </div>
      </div>
    );
  }

  if (result.mode === 'sheet') {
    const totalArea = result.sheets.reduce((s, sh) => s + sh.stockW * sh.stockH, 0);
    const usedArea = result.sheets.reduce((s, sh) => s + sh.pieces.reduce((a, p) => a + p.w * p.h, 0), 0);

    return (
      <div className="flex-1 bg-white overflow-auto p-4">
        <div className="mb-4 flex items-center gap-6 pb-3 border-b border-border">
          <div className="text-sm">
            <span className="text-muted-foreground">Sheets used: </span>
            <span className="font-semibold text-foreground">{result.totalSheets}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Total waste: </span>
            <span className="font-semibold text-foreground">{result.totalWastePercent.toFixed(1)}%</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Material used: </span>
            <span className="font-semibold text-foreground">{totalArea > 0 ? (100 - result.totalWastePercent).toFixed(1) : 0}%</span>
          </div>
          {result.unplacedCount > 0 && (
            <div className="text-sm text-destructive font-medium">
              ⚠ {result.unplacedCount} piece{result.unplacedCount !== 1 ? 's' : ''} could not be placed
            </div>
          )}
        </div>
        {result.sheets.map((sheet, i) => (
          <SheetDiagram key={i} sheet={sheet} units={units} showLabels={showLabels} index={i} />
        ))}
      </div>
    );
  }

  if (result.mode === 'linear') {
    return (
      <div className="flex-1 bg-white overflow-auto p-4">
        <div className="mb-4 flex items-center gap-6 pb-3 border-b border-border">
          <div className="text-sm">
            <span className="text-muted-foreground">Bars used: </span>
            <span className="font-semibold text-foreground">{result.totalBars}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Total waste: </span>
            <span className="font-semibold text-foreground">{result.totalWastePercent.toFixed(1)}%</span>
          </div>
          {result.unplacedCount > 0 && (
            <div className="text-sm text-destructive font-medium">
              ⚠ {result.unplacedCount} piece{result.unplacedCount !== 1 ? 's' : ''} could not be placed
            </div>
          )}
        </div>
        {result.bars.map((bar, i) => (
          <LinearDiagram key={i} bar={bar} units={units} showLabels={showLabels} />
        ))}
      </div>
    );
  }

  return null;
}
