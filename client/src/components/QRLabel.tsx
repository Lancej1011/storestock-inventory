import { QRCodeSVG } from 'qrcode.react';

interface QRLabelProps {
  product: {
    id: string;
    name: string;
    sku: string;
    barcode: string;
  };
  storeName?: string;
  onClose: () => void;
}

// QR value encodes a StoreStock product ID so the barcode scanner
// can instantly resolve it without a manufacturer barcode.
const QR_PREFIX = 'SSID:';

export function QRLabel({ product, storeName, onClose }: QRLabelProps) {
  const qrValue = `${QR_PREFIX}${product.id}`;

  const handlePrint = () => {
    const labelHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Label — ${product.name}</title>
  <style>
    @page { size: 2.25in 1.25in; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      width: 2.25in;
      height: 1.25in;
      display: flex;
      align-items: stretch;
      background: white;
    }
    .label {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      width: 100%;
    }
    .qr { flex-shrink: 0; }
    .info { flex: 1; min-width: 0; overflow: hidden; }
    .name {
      font-size: 8pt;
      font-weight: 900;
      line-height: 1.2;
      word-break: break-word;
      margin-bottom: 3px;
    }
    .sku {
      font-size: 6pt;
      color: #666;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .barcode {
      font-size: 6pt;
      color: #444;
      margin-top: 2px;
      font-family: monospace;
    }
    .store {
      font-size: 5pt;
      color: #999;
      margin-top: 2px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="qr">
      ${document.getElementById('qrlabel-svg-container')?.innerHTML ?? ''}
    </div>
    <div class="info">
      <div class="name">${product.name}</div>
      <div class="sku">${product.sku}</div>
      ${product.barcode ? `<div class="barcode">${product.barcode}</div>` : ''}
      ${storeName ? `<div class="store">${storeName}</div>` : ''}
    </div>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=400,height=300');
    if (!win) return;
    win.document.write(labelHtml);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="premium-card w-full max-w-sm p-6 space-y-6 animate-fade-in-up">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">QR Label</p>
            <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">{product.name}</h3>
            <p className="text-xs font-bold text-slate-400 mt-0.5">{product.sku}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Label preview */}
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-5 flex items-center gap-5">
          <div id="qrlabel-svg-container" className="shrink-0">
            <QRCodeSVG value={qrValue} size={80} level="M" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-slate-900 text-sm leading-tight">{product.name}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">{product.sku}</p>
            {product.barcode && (
              <p className="text-[10px] font-mono text-slate-400 mt-0.5">{product.barcode}</p>
            )}
            {storeName && (
              <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-1">{storeName}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">
            Encodes · {qrValue}
          </p>
          <button
            onClick={handlePrint}
            className="btn-premium w-full py-4 text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            Print Label
          </button>
        </div>
      </div>
    </div>
  );
}
