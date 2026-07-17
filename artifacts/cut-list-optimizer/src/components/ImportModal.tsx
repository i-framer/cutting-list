import { useState, useRef, useCallback } from 'react';
import { X, Upload, FileText, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { CutPiece, StockItem, Mode } from '../types';
import { parseCuttingList, parsedRowsToCutPieces, type ParsedRow } from '../lib/importParser';
import { checkPreviewRow, type BoardSize } from '../lib/oversizeCheck';
import { PortalImportTab } from './PortalImportTab';

interface ImportModalProps {
  mode: Mode;
  onClose: () => void;
  onConfirm: (pieces: CutPiece[], stockItems: StockItem[]) => void;
}

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

async function lookupBoard(code: string): Promise<{ stock_length?: number | null; stock_width?: number | null } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/boards?code=${encodeURIComponent(code)}`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function ImportModal({ mode, onClose, onConfirm }: ImportModalProps) {
  const [tab, setTab] = useState<'portal' | 'paste'>('portal');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isLooking, setIsLooking] = useState(false);
  // material code -> looked-up board size (null = not found / lookup failed)
  const [boardSizes, setBoardSizes] = useState<Map<string, BoardSize | null>>(new Map());
  const [isCheckingBoards, setIsCheckingBoards] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setText(ev.target?.result as string ?? '');
    reader.readAsText(file);
  };

  const handleParse = useCallback(async () => {
    const result = parseCuttingList(text);
    setParsed(result.rows);
    setParseErrors(result.errors);

    // Look up board sizes right away so the preview can flag suspicious rows
    const materials = Array.from(new Set(result.rows.map(r => r.material).filter(Boolean)));
    if (materials.length === 0) {
      setBoardSizes(new Map());
      return;
    }
    setIsCheckingBoards(true);
    const sizes = new Map<string, BoardSize | null>();
    await Promise.all(materials.map(async mat => {
      const board = await lookupBoard(mat);
      sizes.set(mat, board ? {
        length: board.stock_length ?? 0,
        width: board.stock_width ?? 0,
      } : null);
    }));
    setBoardSizes(sizes);
    setIsCheckingBoards(false);
  }, [text]);

  const handleConfirm = useCallback(async () => {
    if (!parsed || parsed.length === 0) return;
    setIsLooking(true);

    const pieces = parsedRowsToCutPieces(parsed);

    const materialSet = new Set(parsed.map(r => r.material).filter(Boolean));
    const stockItems: StockItem[] = [];

    for (const mat of materialSet) {
      // Reuse the parse-time lookup when we have it; fall back to fetching
      const cached = boardSizes.get(mat);
      const board = cached !== undefined
        ? (cached ? { stock_length: cached.length || null, stock_width: cached.width || null } : null)
        : await lookupBoard(mat);
      stockItems.push({
        id: crypto.randomUUID(),
        length: board?.stock_length != null ? String(board.stock_length) : '',
        width: board?.stock_width != null ? String(board.stock_width) : '',
        qty: '1',
        material: mat,
      });
    }

    setIsLooking(false);
    onConfirm(pieces, stockItems);
  }, [parsed, boardSizes, onConfirm]);

  const materialsInParsed = parsed ? Array.from(new Set(parsed.map(r => r.material).filter(Boolean))) : [];

  // Per-row suspicion check for the preview table (null = row looks fine)
  const rowWarnings: (string | null)[] = (parsed ?? []).map(row => {
    const len = parseFloat(row.length);
    const wid = parseFloat(row.width);
    return checkPreviewRow(
      Number.isFinite(len) ? len : 0,
      Number.isFinite(wid) ? wid : 0,
      row.material ? boardSizes.get(row.material) : null,
    );
  });
  const suspiciousCount = rowWarnings.filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-blue-600" />
            <span className="font-semibold text-sm text-gray-800">Import Cutting List</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 shrink-0">
          <button
            onClick={() => setTab('portal')}
            className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === 'portal' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            From i-framer portal
          </button>
          <button
            onClick={() => setTab('paste')}
            className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === 'paste' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Paste / upload
          </button>
        </div>

        {tab === 'portal' && (
          <PortalImportTab mode={mode} onConfirm={onConfirm} onCancel={onClose} />
        )}

        {tab === 'paste' && (
        <>
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Instructions */}
          {!parsed && (
            <p className="text-xs text-gray-500">
              Paste your cutting list below. Board codes should appear as header lines (e.g. <code className="bg-gray-100 px-1 rounded">3mm MDF</code>), followed by job lines like <code className="bg-gray-100 px-1 rounded">WPF-52331 600x400</code> or <code className="bg-gray-100 px-1 rounded">WPF-52332-2 800x600</code>.
            </p>
          )}

          {/* File upload + textarea — only shown before parsing */}
          {!parsed && (
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors text-gray-600"
                >
                  <Upload size={12} /> Upload file (.txt / .csv)
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {text && (
                  <span className="text-xs text-gray-400">File loaded — you can still edit below</span>
                )}
              </div>

              <textarea
                className="w-full h-48 px-3 py-2 text-xs font-mono border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder={"3mm MDF\nWPF-52331 600x400\nWPF-52332-2 800x600\n\nFBCT540X60\nWPF-52333 540x60"}
                value={text}
                onChange={e => setText(e.target.value)}
              />
            </>
          )}

          {/* Parse errors */}
          {parseErrors.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium mb-1">Some lines were skipped:</p>
                {parseErrors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            </div>
          )}

          {/* Preview table */}
          {parsed !== null && (
            <>
              {parsed.length === 0 ? (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  <AlertCircle size={13} />
                  No job lines found. Check that your cutting list includes WPF order numbers and dimensions.
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-xs text-green-700">
                    <CheckCircle2 size={13} />
                    <span>{parsed.length} job{parsed.length !== 1 ? 's' : ''} parsed across {materialsInParsed.length} material{materialsInParsed.length !== 1 ? 's' : ''}. Review below, then click Confirm to import.</span>
                  </div>

                  {isCheckingBoards && (
                    <div className="text-xs text-gray-400">Checking dimensions against board sizes…</div>
                  )}

                  {!isCheckingBoards && suspiciousCount > 0 && (
                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">
                          {suspiciousCount} row{suspiciousCount !== 1 ? 's have' : ' has'} suspicious dimensions (highlighted below).
                        </p>
                        <p>They may have been mis-read. Go back and edit the pasted text, or continue anyway and fix them in the cutting list.</p>
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto border border-gray-200 rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium">Label</th>
                          <th className="px-2 py-1.5 text-left font-medium">Length (mm)</th>
                          <th className="px-2 py-1.5 text-left font-medium">Width (mm)</th>
                          <th className="px-2 py-1.5 text-left font-medium">Qty</th>
                          <th className="px-2 py-1.5 text-left font-medium">Material</th>
                          <th className="px-2 py-1.5 w-6"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {parsed.map((row, i) => {
                          const warning = rowWarnings[i];
                          return (
                            <tr key={i} className={warning ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'}>
                              <td className="px-2 py-1 font-mono text-gray-800">{row.label}</td>
                              <td className={`px-2 py-1 ${warning ? 'text-amber-800 font-semibold' : 'text-gray-700'}`}>{row.length}</td>
                              <td className={`px-2 py-1 ${warning ? 'text-amber-800 font-semibold' : 'text-gray-700'}`}>{row.width}</td>
                              <td className="px-2 py-1 text-gray-700">{row.qty}</td>
                              <td className="px-2 py-1 text-gray-500">{row.material || <span className="italic text-gray-300">none</span>}</td>
                              <td className="px-2 py-1 text-center">
                                {warning && (
                                  <span title={warning}>
                                    <AlertTriangle size={12} className="text-amber-500 inline-block" />
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <button
                    className="text-xs text-blue-500 hover:underline"
                    onClick={() => setParsed(null)}
                  >
                    ← Edit the pasted text
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          {parsed === null ? (
            <button
              onClick={handleParse}
              disabled={!text.trim()}
              className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Parse
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={parsed.length === 0 || isLooking}
              className="px-4 py-1.5 text-sm font-medium bg-green-600 hover:bg-green-500 text-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLooking ? 'Looking up boards…' : `Confirm & Import ${parsed.length} job${parsed.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}
