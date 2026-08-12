'use client';

import { useRef, useState } from 'react';

// Lightweight drag-to-crop over an uploaded map. Draw a box on the image and
// Apply; we redraw the selected region to a canvas at full source resolution and
// hand back a PNG blob. Used to crop the info panel out of map screenshots.
export default function ImageCropper({ url, onCancel, onApply }) {
  const imgRef = useRef(null);
  const wrapRef = useRef(null);
  const [rect, setRect] = useState(null);      // {x,y,w,h} in displayed px
  const [drag, setDrag] = useState(null);      // {sx,sy}
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pos = (e) => {
    const b = wrapRef.current.getBoundingClientRect();
    return { x: Math.max(0, Math.min(e.clientX - b.left, b.width)), y: Math.max(0, Math.min(e.clientY - b.top, b.height)) };
  };
  const onDown = (e) => { const p = pos(e); setDrag(p); setRect({ x: p.x, y: p.y, w: 0, h: 0 }); };
  const onMove = (e) => {
    if (!drag) return;
    const p = pos(e);
    setRect({ x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) });
  };
  const onUp = () => setDrag(null);

  const apply = async () => {
    const img = imgRef.current;
    if (!img) return;
    const dispW = img.clientWidth, dispH = img.clientHeight;
    let r = rect;
    if (!r || r.w < 8 || r.h < 8) r = { x: 0, y: 0, w: dispW, h: dispH };
    const sX = natural.w / dispW, sY = natural.h / dispH;
    const sx = r.x * sX, sy = r.y * sY, sw = r.w * sX, sh = r.h * sY;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw));
    canvas.height = Math.max(1, Math.round(sh));
    try {
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      setBusy(true);
      canvas.toBlob((blob) => {
        setBusy(false);
        if (blob) onApply(blob); else setErr('Could not crop this image');
      }, 'image/png');
    } catch {
      setErr('This image could not be cropped in the browser (CORS). Try re-uploading it.');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-slate-800 rounded-xl p-4 max-w-3xl w-full border border-slate-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-white font-semibold">Crop map</h4>
          <button onClick={onCancel} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <p className="text-xs text-slate-400 mb-2">Drag a box over the part to keep (crop out any info panel). Apply with nothing selected to keep the whole image.</p>
        <div
          ref={wrapRef}
          className="relative inline-block select-none cursor-crosshair"
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        >
          <img
            ref={imgRef}
            src={url}
            crossOrigin="anonymous"
            draggable={false}
            onLoad={(e) => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
            className="max-w-full max-h-[62vh] block pointer-events-none"
            alt="Crop source"
          />
          {rect && rect.w > 0 && (
            <>
              <div className="absolute border-2 border-emerald-400 bg-emerald-400/10 pointer-events-none"
                style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
            </>
          )}
        </div>
        {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
        <div className="flex gap-2 mt-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white text-sm">Cancel</button>
          <button onClick={apply} disabled={busy} className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'Cropping…' : 'Apply crop'}
          </button>
        </div>
      </div>
    </div>
  );
}
