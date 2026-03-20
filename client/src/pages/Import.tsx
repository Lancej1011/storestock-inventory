import { useState, useRef } from 'react';
import Papa from 'papaparse';
import api from '../services/api';

interface ImportRow {
  barcode: string;
  sku: string;
  name: string;
  description?: string;
  costPrice: number;
  retailPrice: number;
  categoryName?: string;
  supplierName?: string;
  _error?: string;
}

interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

const REQUIRED_COLS = ['barcode', 'sku', 'name', 'costPrice', 'retailPrice'];

const TEMPLATE_CSV = `barcode,sku,name,description,costPrice,retailPrice,categoryName,supplierName
012345678901,SKU-001,Example Product,A sample product description,2.50,4.99,Snacks,Acme Supplier
098765432109,SKU-002,Another Product,,1.00,2.49,Beverages,
`;

export default function Import() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setParseError(null);
    setResult(null);
    setRows([]);
    setFileName(file.name);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        const headers = parsed.meta.fields ?? [];
        const missing = REQUIRED_COLS.filter((c) => !headers.includes(c));
        if (missing.length) {
          setParseError(`Missing required columns: ${missing.join(', ')}`);
          return;
        }

        const mapped: ImportRow[] = parsed.data.map((r, i) => {
          const costPrice = parseFloat(r.costPrice);
          const retailPrice = parseFloat(r.retailPrice);
          const errors: string[] = [];
          if (!r.barcode?.trim()) errors.push('barcode required');
          if (!r.sku?.trim()) errors.push('sku required');
          if (!r.name?.trim()) errors.push('name required');
          if (isNaN(costPrice) || costPrice < 0) errors.push('invalid costPrice');
          if (isNaN(retailPrice) || retailPrice < 0) errors.push('invalid retailPrice');
          return {
            barcode: r.barcode?.trim(),
            sku: r.sku?.trim(),
            name: r.name?.trim(),
            description: r.description?.trim() || undefined,
            costPrice,
            retailPrice,
            categoryName: r.categoryName?.trim() || undefined,
            supplierName: r.supplierName?.trim() || undefined,
            _error: errors.length ? errors.join('; ') : undefined,
          } as ImportRow & { _error?: string };
        });

        setRows(mapped);
      },
      error: (err) => setParseError(err.message),
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const validRows = rows.filter((r) => !r._error);
  const invalidRows = rows.filter((r) => r._error);

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setLoading(true);
    try {
      // Strip internal _error field before sending
      const clean = validRows.map(({ _error: _e, ...rest }) => rest);
      const res = await api.post('/import/csv', { rows: clean });
      setResult(res.data);
      setRows([]);
      setFileName(null);
    } catch (err: any) {
      setParseError(err?.response?.data?.message ?? 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 animate-fade-in pb-24">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 dark:text-white font-heading tracking-tight">
            Catalog Import
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium tracking-tight">
            Bulk-load products from a supplier CSV before delivery arrives
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-500 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Template
        </button>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">

        {/* Result banner */}
        {result && (
          <div className="premium-card p-6 animate-fade-in border-l-4 border-emerald-500">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3">Import Complete</p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-3xl font-black text-emerald-500">{result.created}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Created</p>
              </div>
              <div>
                <p className="text-3xl font-black text-amber-400">{result.skipped}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Skipped</p>
              </div>
              <div>
                <p className="text-3xl font-black text-red-400">{result.errors.length}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Errors</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-4 space-y-1 max-h-32 overflow-y-auto">
                {result.errors.map((e) => (
                  <p key={e.row} className="text-xs text-red-400 font-medium">Row {e.row}: {e.message}</p>
                ))}
              </div>
            )}
            <button
              onClick={() => setResult(null)}
              className="mt-4 w-full py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-500 hover:border-indigo-300 transition-all"
            >
              Import Another File
            </button>
          </div>
        )}

        {/* File drop zone */}
        {!result && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="premium-card p-10 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-400 cursor-pointer transition-all group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
            />
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/20 transition-colors">
              <svg className="w-7 h-7 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            {fileName ? (
              <p className="font-black text-indigo-600 dark:text-indigo-400">{fileName}</p>
            ) : (
              <>
                <p className="font-black text-slate-900 dark:text-white mb-1">Drop CSV here or click to browse</p>
                <p className="text-sm text-slate-400 font-medium">Supports supplier exports and the StoreStock template</p>
              </>
            )}
          </div>
        )}

        {/* Parse error */}
        {parseError && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 p-4 rounded-2xl text-sm font-bold">
            {parseError}
          </div>
        )}

        {/* Preview table */}
        {rows.length > 0 && !result && (
          <div className="premium-card overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Preview</p>
                <p className="font-black text-slate-900 dark:text-white mt-0.5">
                  {validRows.length} valid &middot;{' '}
                  <span className={invalidRows.length > 0 ? 'text-red-400' : 'text-slate-400'}>
                    {invalidRows.length} invalid
                  </span>
                </p>
              </div>
              <button
                onClick={() => { setRows([]); setFileName(null); }}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-400 transition-colors"
              >
                Clear
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-black text-slate-400 uppercase tracking-wider text-[9px]">#</th>
                    <th className="text-left px-4 py-2 font-black text-slate-400 uppercase tracking-wider text-[9px]">Name</th>
                    <th className="text-left px-4 py-2 font-black text-slate-400 uppercase tracking-wider text-[9px]">SKU</th>
                    <th className="text-left px-4 py-2 font-black text-slate-400 uppercase tracking-wider text-[9px]">Barcode</th>
                    <th className="text-right px-4 py-2 font-black text-slate-400 uppercase tracking-wider text-[9px]">Cost</th>
                    <th className="text-right px-4 py-2 font-black text-slate-400 uppercase tracking-wider text-[9px]">Retail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((r, i) => (
                    <tr key={i} className={r._error ? 'bg-red-50/50 dark:bg-red-900/10' : ''}>
                      <td className="px-4 py-2 text-slate-400 font-medium">{i + 1}</td>
                      <td className="px-4 py-2">
                        <span className="font-bold text-slate-900 dark:text-white">{r.name || '—'}</span>
                        {r._error && (
                          <p className="text-[9px] text-red-400 font-bold mt-0.5">{r._error}</p>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-500 font-medium">{r.sku || '—'}</td>
                      <td className="px-4 py-2 font-mono text-slate-400">{r.barcode || '—'}</td>
                      <td className="px-4 py-2 text-right text-slate-500 font-medium">
                        {isNaN(r.costPrice) ? '—' : `$${r.costPrice.toFixed(2)}`}
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-slate-700 dark:text-slate-300">
                        {isNaN(r.retailPrice) ? '—' : `$${r.retailPrice.toFixed(2)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50">
              <button
                onClick={handleImport}
                disabled={loading || validRows.length === 0}
                className="btn-premium w-full py-4 text-[10px] uppercase tracking-[0.2em] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>Import {validRows.length} Product{validRows.length !== 1 ? 's' : ''}</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Column guide */}
        {rows.length === 0 && !result && (
          <div className="premium-card p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Required Columns</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['barcode', 'Product barcode / UPC'],
                ['sku', 'Internal stock-keeping unit'],
                ['name', 'Product display name'],
                ['costPrice', 'Wholesale cost (number)'],
                ['retailPrice', 'Shelf price (number)'],
              ].map(([col, desc]) => (
                <div key={col} className="flex gap-2 items-start">
                  <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono font-bold text-indigo-600 dark:text-indigo-400 shrink-0">{col}</code>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{desc}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-4 mb-3">Optional Columns</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['description', 'Product description'],
                ['categoryName', 'Matched by name to existing category'],
                ['supplierName', 'Matched by name to existing supplier'],
              ].map(([col, desc]) => (
                <div key={col} className="flex gap-2 items-start">
                  <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono font-bold text-slate-500 shrink-0">{col}</code>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
