import type {
  CutPiece,
  StockItem,
  Options,
  PlacedPiece,
  UsedSheet,
  UsedBar,
  SheetOptimizationResult,
  LinearOptimizationResult,
} from '../types';
import { parseValue } from './units';
import type { Units } from './units';

const PIECE_COLORS = [
  '#4e9af1', '#f47c7c', '#6dc06d', '#f0b429', '#a78bfa',
  '#f97316', '#14b8a6', '#ec4899', '#84cc16', '#06b6d4',
  '#8b5cf6', '#ef4444', '#10b981', '#f59e0b', '#3b82f6',
  '#d946ef', '#0ea5e9', '#22c55e', '#fb923c', '#e879f9',
];

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function splitRect(free: FreeRect, pw: number, ph: number): FreeRect[] {
  const result: FreeRect[] = [];
  const rightW = free.w - pw;
  const bottomH = free.h - ph;
  if (rightW > 0) {
    result.push({ x: free.x + pw, y: free.y, w: rightW, h: free.h });
  }
  if (bottomH > 0) {
    result.push({ x: free.x, y: free.y + ph, w: pw, h: bottomH });
  }
  return result;
}

function findBestFit(
  freeRects: FreeRect[],
  pw: number,
  ph: number,
  canRotate: boolean,
): { rect: FreeRect; rotated: boolean; score: number } | null {
  let best: { rect: FreeRect; rotated: boolean; score: number } | null = null;

  for (const rect of freeRects) {
    const fits = rect.w >= pw && rect.h >= ph;
    const fitsRotated = canRotate && pw !== ph && rect.w >= ph && rect.h >= pw;

    if (fits) {
      const score = rect.w * rect.h;
      if (!best || score < best.score) {
        best = { rect, rotated: false, score };
      }
    }
    if (fitsRotated) {
      const score = rect.w * rect.h;
      if (!best || score < best.score) {
        best = { rect, rotated: true, score };
      }
    }
  }
  return best;
}

/** Returns true if the piece can fit (in either orientation) on a fresh sheet of given dimensions */
function canFitOnSheet(
  sw: number,
  sh: number,
  pw: number,
  ph: number,
  kerf: number,
  canRotate: boolean,
): boolean {
  const normalFit = sw >= pw + kerf && sh >= ph + kerf;
  const rotatedFit = canRotate && sw >= ph + kerf && sh >= pw + kerf;
  return normalFit || rotatedFit;
}

export function optimizeSheets(
  pieces: CutPiece[],
  stock: StockItem[],
  options: Options,
  units: Units,
): SheetOptimizationResult {
  const kerf = parseValue(options.kerf, units);

  const expandedPieces: Array<{ piece: CutPiece; idx: number; colorIdx: number }> = [];
  let colorCounter = 0;
  for (const piece of pieces) {
    const qty = Math.max(1, parseInt(piece.qty) || 1);
    for (let i = 0; i < qty; i++) {
      expandedPieces.push({ piece, idx: i, colorIdx: colorCounter % PIECE_COLORS.length });
    }
    colorCounter++;
  }

  expandedPieces.sort((a, b) => {
    const aArea = parseValue(a.piece.length, units) * parseValue(a.piece.width, units);
    const bArea = parseValue(b.piece.length, units) * parseValue(b.piece.width, units);
    return bArea - aArea;
  });

  const expandedStock: Array<{ item: StockItem; remaining: number }> = [];
  for (const item of stock) {
    const qty = Math.max(1, parseInt(item.qty) || 1);
    expandedStock.push({ item, remaining: qty });
  }

  const usedSheets: UsedSheet[] = [];
  const sheetFreeRects: FreeRect[][] = [];
  const unplaced: typeof expandedPieces = [];

  function tryPlaceOnSheet(sheetIdx: number, epIdx: number): boolean {
    const ep = expandedPieces[epIdx];
    const sheet = usedSheets[sheetIdx];
    const pw = parseValue(ep.piece.length, units);
    const ph = parseValue(ep.piece.width, units);
    if (!pw || !ph) return false;

    const canRotate = !options.considerGrain;
    const fit = findBestFit(sheetFreeRects[sheetIdx], pw + kerf, ph + kerf, canRotate);
    if (!fit) return false;

    const rw = fit.rotated ? ph : pw;
    const rh = fit.rotated ? pw : ph;
    const placedPiece: PlacedPiece = {
      pieceId: ep.piece.id,
      pieceIndex: ep.idx,
      x: fit.rect.x,
      y: fit.rect.y,
      w: rw,
      h: rh,
      rotated: fit.rotated,
      label: ep.piece.label || `${rw}×${rh}`,
      color: PIECE_COLORS[ep.colorIdx],
      originalW: pw,
      originalH: ph,
    };

    sheet.pieces.push(placedPiece);

    const newRects = splitRect(fit.rect, rw + kerf, rh + kerf);
    sheetFreeRects[sheetIdx] = sheetFreeRects[sheetIdx]
      .filter(r => r !== fit.rect)
      .concat(newRects);
    return true;
  }

  for (let epIdx = 0; epIdx < expandedPieces.length; epIdx++) {
    const ep = expandedPieces[epIdx];
    const pw = parseValue(ep.piece.length, units);
    const ph = parseValue(ep.piece.width, units);
    if (!pw || !ph) continue;

    let wasPlaced = false;

    // Try placing on already-open sheets first (when not limited to one sheet)
    if (!options.useOneSheet) {
      for (let si = 0; si < usedSheets.length; si++) {
        if (options.considerMaterial && usedSheets[si].material !== ep.piece.material) continue;
        if (tryPlaceOnSheet(si, epIdx)) { wasPlaced = true; break; }
      }
    }

    // Open a new sheet from stock if still not placed
    if (!wasPlaced) {
      for (let stockIdx = 0; stockIdx < expandedStock.length; stockIdx++) {
        if (expandedStock[stockIdx].remaining <= 0) continue;
        if (options.considerMaterial && expandedStock[stockIdx].item.material !== ep.piece.material) continue;

        const sw = parseValue(expandedStock[stockIdx].item.length, units);
        const sh = parseValue(expandedStock[stockIdx].item.width, units);
        const canRotate = !options.considerGrain;

        // Pre-check: piece must fit on a fresh sheet before consuming stock
        if (!canFitOnSheet(sw, sh, pw, ph, kerf, canRotate)) continue;

        // Open new sheet and attempt placement
        expandedStock[stockIdx].remaining--;
        const sheet: UsedSheet = {
          stockId: expandedStock[stockIdx].item.id,
          stockIndex: stockIdx,
          sheetNum: usedSheets.length + 1,
          stockW: sw,
          stockH: sh,
          pieces: [],
          wastePercent: 0,
          material: expandedStock[stockIdx].item.material,
        };
        usedSheets.push(sheet);
        sheetFreeRects.push([{ x: 0, y: 0, w: sw, h: sh }]);
        const si = usedSheets.length - 1;

        if (tryPlaceOnSheet(si, epIdx)) {
          wasPlaced = true;
          break;
        } else {
          // Placement failed unexpectedly — roll back the sheet opening
          expandedStock[stockIdx].remaining++;
          usedSheets.pop();
          sheetFreeRects.pop();
        }
      }
    }

    if (!wasPlaced) unplaced.push(ep);
  }

  for (const sheet of usedSheets) {
    const totalArea = sheet.stockW * sheet.stockH;
    const usedArea = sheet.pieces.reduce((s, p) => s + p.w * p.h, 0);
    sheet.wastePercent = totalArea > 0 ? ((totalArea - usedArea) / totalArea) * 100 : 0;
  }

  const totalArea = usedSheets.reduce((s, sh) => s + sh.stockW * sh.stockH, 0);
  const usedArea = usedSheets.reduce((s, sh) => s + sh.pieces.reduce((a, p) => a + p.w * p.h, 0), 0);

  return {
    mode: 'sheet',
    sheets: usedSheets,
    totalSheets: usedSheets.length,
    totalWastePercent: totalArea > 0 ? ((totalArea - usedArea) / totalArea) * 100 : 0,
    unplacedCount: unplaced.length,
  };
}

export function optimizeLinear(
  pieces: CutPiece[],
  stock: StockItem[],
  options: Options,
  units: Units,
): LinearOptimizationResult {
  const kerf = parseValue(options.kerf, units);

  const expandedPieces: Array<{ piece: CutPiece; idx: number; colorIdx: number }> = [];
  let colorCounter = 0;
  for (const piece of pieces) {
    const qty = Math.max(1, parseInt(piece.qty) || 1);
    for (let i = 0; i < qty; i++) {
      expandedPieces.push({ piece, idx: i, colorIdx: colorCounter % PIECE_COLORS.length });
    }
    colorCounter++;
  }

  expandedPieces.sort((a, b) =>
    parseValue(b.piece.length, units) - parseValue(a.piece.length, units),
  );

  const expandedStock: Array<{ item: StockItem; remaining: number }> = [];
  for (const item of stock) {
    const qty = Math.max(1, parseInt(item.qty) || 1);
    expandedStock.push({ item, remaining: qty });
  }

  const usedBars: UsedBar[] = [];
  const barRemaining: number[] = [];
  const unplaced: typeof expandedPieces = [];

  for (const ep of expandedPieces) {
    const pLen = parseValue(ep.piece.length, units);
    if (!pLen) continue;

    let wasPlaced = false;

    // Try packing into an existing open bar
    if (!options.useOneSheet) {
      for (let bi = 0; bi < usedBars.length; bi++) {
        if (options.considerMaterial && usedBars[bi].material !== ep.piece.material) continue;
        const needed = pLen + (usedBars[bi].segments.length > 0 ? kerf : 0);
        if (barRemaining[bi] >= needed) {
          barRemaining[bi] -= needed;
          usedBars[bi].segments.push({
            pieceId: ep.piece.id,
            pieceIndex: ep.idx,
            length: pLen,
            label: ep.piece.label || `${pLen}`,
            color: PIECE_COLORS[ep.colorIdx],
          });
          wasPlaced = true;
          break;
        }
      }
    }

    // Open a new bar from stock
    if (!wasPlaced) {
      for (let stockIdx = 0; stockIdx < expandedStock.length; stockIdx++) {
        if (expandedStock[stockIdx].remaining <= 0) continue;
        if (options.considerMaterial && expandedStock[stockIdx].item.material !== ep.piece.material) continue;
        const sLen = parseValue(expandedStock[stockIdx].item.length, units);
        if (sLen < pLen) continue;

        expandedStock[stockIdx].remaining--;
        const bar: UsedBar = {
          stockId: expandedStock[stockIdx].item.id,
          stockIndex: stockIdx,
          barNum: usedBars.length + 1,
          stockLength: sLen,
          segments: [],
          wasteLength: 0,
          wastePercent: 0,
          material: expandedStock[stockIdx].item.material,
        };
        usedBars.push(bar);
        barRemaining.push(sLen);

        const bi = usedBars.length - 1;
        barRemaining[bi] -= pLen;
        usedBars[bi].segments.push({
          pieceId: ep.piece.id,
          pieceIndex: ep.idx,
          length: pLen,
          label: ep.piece.label || `${pLen}`,
          color: PIECE_COLORS[ep.colorIdx],
        });
        wasPlaced = true;
        break;
      }
    }

    if (!wasPlaced) unplaced.push(ep);
  }

  for (let i = 0; i < usedBars.length; i++) {
    usedBars[i].wasteLength = Math.max(0, barRemaining[i]);
    usedBars[i].wastePercent = usedBars[i].stockLength > 0
      ? (usedBars[i].wasteLength / usedBars[i].stockLength) * 100
      : 0;
  }

  const totalLen = usedBars.reduce((s, b) => s + b.stockLength, 0);
  const wasteLen = usedBars.reduce((s, b) => s + b.wasteLength, 0);

  return {
    mode: 'linear',
    bars: usedBars,
    totalBars: usedBars.length,
    totalWastePercent: totalLen > 0 ? (wasteLen / totalLen) * 100 : 0,
    unplacedCount: unplaced.length,
  };
}
