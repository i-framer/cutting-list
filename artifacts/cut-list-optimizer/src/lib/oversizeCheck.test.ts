import { findOversizePieces } from './oversizeCheck';
import type { CutPiece, StockItem } from '../types';

// Simple test runner — run with: npx tsx oversizeCheck.test.ts
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error('  ', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}

function expectLength(val: unknown[], n: number) {
  if (val.length !== n)
    throw new Error(`Expected length ${n}, got ${val.length}: ${JSON.stringify(val)}`);
}

let idCounter = 0;
function piece(length: string, width: string, label = '', material = ''): CutPiece {
  return { id: `p${idCounter++}`, length, width, qty: '1', label, material, grain: false };
}
function board(length: string, width: string, material = ''): StockItem {
  return { id: `s${idCounter++}`, length, width, qty: '1', material };
}

test('piece that fits is not flagged', () => {
  expectLength(findOversizePieces([piece('600', '400')], [board('2440', '1220')], 'metric'), 0);
});

test('piece larger than any board is flagged', () => {
  const w = findOversizePieces([piece('3000', '400', 'WPF-1')], [board('2440', '1220')], 'metric');
  expectLength(w, 1);
  if (w[0].label !== 'WPF-1') throw new Error('wrong label');
});

test('rotated fit is not flagged', () => {
  expectLength(findOversizePieces([piece('1220', '2000')], [board('2440', '1220')], 'metric'), 0);
});

test('width overflow flagged when neither orientation fits', () => {
  expectLength(findOversizePieces([piece('1500', '1300')], [board('2440', '1220')], 'metric'), 1);
});

test('no boards configured -> no warnings', () => {
  expectLength(findOversizePieces([piece('99999', '99999')], [board('', '')], 'metric'), 0);
});

test('linear piece compared by length only', () => {
  expectLength(findOversizePieces([piece('2400', '')], [board('3000', '')], 'metric'), 0);
  expectLength(findOversizePieces([piece('3400', '')], [board('3000', '')], 'metric'), 1);
});

test('material-specific comparison when matching boards exist', () => {
  const boards = [board('2440', '1220', 'MDF'), board('1000', '500', 'PLY')];
  // PLY piece too big for PLY board, even though MDF board could hold it
  expectLength(findOversizePieces([piece('2000', '1000', 'x', 'PLY')], boards, 'metric'), 1);
  // MDF piece fits MDF board
  expectLength(findOversizePieces([piece('2000', '1000', 'x', 'MDF')], boards, 'metric'), 0);
});

test('piece material with no matching board falls back to all boards', () => {
  const boards = [board('2440', '1220', 'MDF')];
  expectLength(findOversizePieces([piece('2000', '1000', 'x', 'OAK')], boards, 'metric'), 0);
  expectLength(findOversizePieces([piece('5000', '1000', 'x', 'OAK')], boards, 'metric'), 1);
});

test('empty pieces are skipped', () => {
  expectLength(findOversizePieces([piece('', '')], [board('2440', '1220')], 'metric'), 0);
});

test('metre-vs-mm mistake gets caught (e.g. 2.4 parsed as 2400 wrongly scaled)', () => {
  // A quantity column mis-read as a dimension: 25000 mm piece
  expectLength(findOversizePieces([piece('25000', '400', 'WPF-9')], [board('2440', '1220')], 'metric'), 1);
});
