import type { CutPiece } from '../types';

export interface ParsedRow {
  label: string;
  length: string;
  width: string;
  qty: string;
  material: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  materials: string[];
  errors: string[];
}

// ---------- Patterns ----------

// WPF job number with optional qty suffix: WPF-52331 or WPF-52331-2
const WPF_PATTERN = /\bWPF-(\d+)(?:-(\d+))?\b/i;

// Dimensions with explicit separator: 600x400, 600 x 400, 600mm x 400mm, 600×400, 600*400 etc.
const DIM_EXPLICIT = /(\d+(?:\.\d+)?)\s*(?:mm)?\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*(?:mm)?/;

// Comma-separated dimensions: 600,400 or 600, 400 (used in some exports)
const DIM_COMMA = /(\d+(?:\.\d+)?)\s*(?:mm)?\s*,\s*(\d+(?:\.\d+)?)\s*(?:mm)?/;

// Fallback: two standalone numbers separated by whitespace (for tab/space-delimited exports)
// Only fires when already on a line known to contain a WPF number.
const DIM_SPACE = /(?:^|\s)(\d+(?:\.\d+)?)\s*(?:mm)?\s+(\d+(?:\.\d+)?)\s*(?:mm)?(?:\s|$)/;

function extractDimensions(line: string): [string, string] | null {
  const m1 = line.match(DIM_EXPLICIT);
  if (m1) return [m1[1], m1[2]];
  const mc = line.match(DIM_COMMA);
  if (mc) return [mc[1], mc[2]];
  const m2 = line.match(DIM_SPACE);
  if (m2) return [m2[1], m2[2]];
  return null;
}

function isJobLine(line: string): boolean {
  if (!WPF_PATTERN.test(line)) return false;
  return extractDimensions(line) !== null;
}

// Known metadata keywords — lines containing these are skipped
const METADATA_RE = /\b(total|page|count|date|order|invoice|weight|area|sheet|off|item|description|ref|reference)\b/i;

// Board code heuristics:
// - NOT a job line
// - NOT containing a colon (avoids "Total: 5", "Date: ...")
// - NOT containing metadata keywords
// - MUST contain at least one letter
// - short enough to be a code (≤80 chars)
// - NOT a standalone dimension like "2400×1200"
// - NOT starting with a digit followed by whitespace ("1 job", "3 off", "2 pieces")
//   BUT "3mm", "18mm" etc ARE allowed (digit immediately followed by a letter)
function isBoardCodeLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (WPF_PATTERN.test(t)) return false;      // WPF job numbers are never board codes
  if (/^\d+\s/.test(t)) return false;        // digit + space = count/quantity line
  if (t.includes(':')) return false;           // colon = metadata
  if (METADATA_RE.test(t)) return false;
  if (!/[a-zA-Z]/.test(t)) return false;      // must contain letters
  if (t.length > 80) return false;
  if (/^\d+\s*[xX×*]\s*\d+$/.test(t)) return false; // standalone dimension
  return true;
}

// ---------- CSV detection ----------

type Delimiter = ',' | ';' | '\t';

// Split a delimited row, honouring double-quoted fields ("a, b" stays one field)
function splitDelimited(line: string, delimiter: Delimiter): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// Detect a delimited (CSV-like) format. Requires most lines to split into 3+
// fields so that a section-format line like "WPF-52331 600,400" (one comma
// used as a dimension separator) is NOT mistaken for CSV.
function detectDelimiter(lines: string[]): Delimiter | null {
  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length < 2) return null;
  const candidates: Delimiter[] = [',', ';', '\t'];
  for (const d of candidates) {
    const multiField = nonEmpty.filter(l => splitDelimited(l, d).length >= 3);
    if (multiField.length >= nonEmpty.length * 0.6) return d;
  }
  return null;
}

type CsvColumns = {
  labelIdx: number;
  lengthIdx: number;  // first dimension (mapped from "Width" in OMS format)
  widthIdx: number;   // second dimension (mapped from "Height" in OMS format)
  qtyIdx: number;
  materialIdx: number;
};

function detectCsvColumns(header: string, delimiter: Delimiter): CsvColumns | null {
  // A row containing a WPF job number is data, not a header
  if (WPF_PATTERN.test(header)) return null;
  const cols = splitDelimited(header, delimiter).map(c => c.toLowerCase());
  const find = (...names: string[]) => {
    for (const name of names) {
      const idx = cols.findIndex(c => c.includes(name));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const labelIdx = find('job', 'label', 'ref', 'order', 'wpf');
  // In the OMS cutting list, "Width" is the first (primary) dimension and maps to
  // the optimizer's "length" field; "Height" is the second and maps to "width".
  const lengthIdx = find('width', 'length', 'w');
  const widthIdx = find('height', 'h');
  const qtyIdx = find('qty', 'quantity', 'q');
  const materialIdx = find('material', 'board', 'code', 'mat');

  if (labelIdx === -1 || (lengthIdx === -1 && widthIdx === -1)) return null;
  return { labelIdx, lengthIdx, widthIdx, qtyIdx, materialIdx };
}

function parseCsvRow(line: string, cols: CsvColumns, delimiter: Delimiter, lineNum: number, errors: string[]): ParsedRow | null {
  const parts = splitDelimited(line, delimiter);
  const get = (idx: number) => (idx >= 0 && idx < parts.length ? parts[idx] : '');

  const rawLabel = get(cols.labelIdx);
  if (!rawLabel) return null;

  const wpfMatch = rawLabel.match(/WPF-(\d+)(?:-(\d+))?/i);
  const label = wpfMatch ? rawLabel.toUpperCase() : rawLabel;
  const qtyFromLabel = wpfMatch?.[2] ?? '';

  const length = get(cols.lengthIdx).replace(/[^0-9.]/g, '');
  const width = cols.widthIdx >= 0
    ? get(cols.widthIdx).replace(/[^0-9.]/g, '')
    : '';
  const qty = get(cols.qtyIdx).replace(/[^0-9]/g, '') || qtyFromLabel || '1';
  const material = get(cols.materialIdx);

  if (!length) {
    errors.push(`Line ${lineNum}: Could not extract dimensions from "${line}"`);
    return null;
  }

  return { label, length, width, qty, material };
}

// ---------- Section-format job line parser ----------

function parseSectionLine(
  line: string,
  currentMaterial: string,
  lineNum: number,
  errors: string[],
): ParsedRow | null {
  const wpfMatch = line.match(WPF_PATTERN);
  if (!wpfMatch) return null;

  const jobNum = wpfMatch[0].toUpperCase();
  const qtySuffix = wpfMatch[2];
  const qty = qtySuffix ?? '1';

  // Remove the WPF token before searching for dimensions to avoid false matches
  const withoutWpf = line.replace(WPF_PATTERN, '').trim();
  const dims = extractDimensions(withoutWpf) ?? extractDimensions(line);

  if (!dims) {
    errors.push(`Line ${lineNum}: Found job number but no dimensions in "${line}"`);
    return null;
  }

  return { label: jobNum, length: dims[0], width: dims[1], qty, material: currentMaterial };
}

// ---------- Public API ----------

export function parseCuttingList(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const rows: ParsedRow[] = [];
  const materialsSet = new Set<string>();
  const errors: string[] = [];

  const delimiter = detectDelimiter(lines);

  if (delimiter) {
    const nonEmpty = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.trim());
    const firstLine = nonEmpty[0];
    const cols = firstLine ? detectCsvColumns(firstLine.l, delimiter) : null;

    if (cols) {
      // Has a recognisable header row — skip it, parse the rest
      for (let i = 1; i < nonEmpty.length; i++) {
        const { l, i: lineIdx } = nonEmpty[i];
        const row = parseCsvRow(l, cols, delimiter, lineIdx + 1, errors);
        if (row) {
          rows.push(row);
          if (row.material) materialsSet.add(row.material);
        }
      }
    } else {
      // No header detected — treat each row as a section-format job line
      for (const { l, i: lineIdx } of nonEmpty) {
        const normalised = splitDelimited(l, delimiter).join(' ').trim();
        if (isJobLine(normalised)) {
          const row = parseSectionLine(normalised, '', lineIdx + 1, errors);
          if (row) rows.push(row);
        } else {
          errors.push(
            `Line ${lineIdx + 1}: Not recognised as a job line — "${l}". Expected a WPF job number and two dimensions (e.g. "WPF-52331,600,400").`,
          );
        }
      }
    }
  } else {
    // Section format: board code headers + job lines
    let currentMaterial = '';

    for (let i = 0; i < lines.length; i++) {
      // Normalise tabs to spaces
      const normalised = lines[i].replace(/\t+/g, ' ').trim();

      if (!normalised) continue;

      if (isJobLine(normalised)) {
        const row = parseSectionLine(normalised, currentMaterial, i + 1, errors);
        if (row) {
          rows.push(row);
          if (currentMaterial) materialsSet.add(currentMaterial);
        }
      } else if (isBoardCodeLine(normalised)) {
        currentMaterial = normalised;
      } else {
        // Skip — only report if it looks meaningful (not just decoration)
        if (normalised.length > 2 && !/^[-=_*#]+$/.test(normalised)) {
          const hint = WPF_PATTERN.test(normalised)
            ? 'Found a WPF job number but no dimensions'
            : 'Not recognised as a board code or job line';
          errors.push(
            `Line ${i + 1}: Skipped — "${normalised}" (${hint}. Expected a board code on its own line, or a job line like "WPF-52331 600x400".)`,
          );
        }
      }
    }
  }

  return { rows, materials: Array.from(materialsSet), errors };
}

export function parsedRowsToCutPieces(rows: ParsedRow[]): CutPiece[] {
  return rows.map(row => ({
    id: crypto.randomUUID(),
    length: row.length,
    width: row.width,
    qty: row.qty,
    label: row.label,
    material: row.material,
    grain: false,
  }));
}
