import type { CutPiece, StockItem } from '../types';
import { parseValue, type Units } from './units';

export interface OversizeWarning {
  pieceId: string;
  label: string;
  length: number;
  width: number;
  material: string;
}

// Sanity ceiling for import previews: dimensions above this are almost
// certainly a mis-read (mm value pasted as cm, concatenated digits, etc.)
export const SANITY_CEILING_MM = 5000;

export interface BoardSize {
  length: number; // mm, 0 = unknown
  width: number;  // mm, 0 = unknown (linear stock)
}

// Preview-time heuristic for a single row: flags dimensions that exceed the
// looked-up board size (allowing rotation) or the sanity ceiling. Returns a
// human-readable reason, or null when the row looks fine. Board may be null
// when the material could not be looked up — then only the ceiling applies.
export function checkPreviewRow(
  lengthMm: number,
  widthMm: number,
  board: BoardSize | null | undefined,
): string | null {
  if (lengthMm > SANITY_CEILING_MM || widthMm > SANITY_CEILING_MM) {
    return `Dimension over ${SANITY_CEILING_MM} mm — likely a mis-read`;
  }
  if (!board || board.length <= 0) return null;

  if (widthMm <= 0 || board.width <= 0) {
    // Linear comparison: only lengths matter
    const max = Math.max(board.length, board.width);
    if (lengthMm > max) {
      return `Longer than the ${max} mm stock for this material`;
    }
    return null;
  }

  const fits =
    (lengthMm <= board.length && widthMm <= board.width) ||
    (lengthMm <= board.width && widthMm <= board.length);
  if (!fits) {
    return `Exceeds the ${board.length}×${board.width} mm board for this material`;
  }
  return null;
}

// A piece is flagged when it cannot fit on ANY configured stock board,
// even when rotated. Pieces are compared against boards of the same
// material when such boards exist; otherwise against all boards.
// If no stock boards have dimensions yet, nothing is flagged.
export function findOversizePieces(
  pieces: CutPiece[],
  stock: StockItem[],
  units: Units,
): OversizeWarning[] {
  const boards = stock
    .map(s => ({
      length: parseValue(s.length, units),
      width: parseValue(s.width, units),
      material: s.material.trim(),
    }))
    .filter(b => b.length > 0);

  if (boards.length === 0) return [];

  const warnings: OversizeWarning[] = [];

  for (const p of pieces) {
    const pl = parseValue(p.length, units);
    if (pl <= 0) continue;
    const pw = parseValue(p.width, units);
    const mat = p.material.trim();

    const sameMaterial = mat ? boards.filter(b => b.material === mat) : [];
    const candidates = sameMaterial.length > 0 ? sameMaterial : boards;

    const fits = candidates.some(b => {
      if (pw <= 0 || b.width <= 0) {
        // Linear comparison: only lengths matter
        return pl <= Math.max(b.length, b.width > 0 ? b.width : 0);
      }
      // Sheet comparison: allow rotation
      return (
        (pl <= b.length && pw <= b.width) ||
        (pl <= b.width && pw <= b.length)
      );
    });

    if (!fits) {
      warnings.push({
        pieceId: p.id,
        label: p.label.trim(),
        length: pl,
        width: pw,
        material: mat,
      });
    }
  }

  return warnings;
}
