'use client';

import { useState, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { resolveOffer } from '@/lib/offerTemplate';
import ImageCropper from '@/components/ImageCropper';

// The "Produce Offer PDF" screen. Opens from a lead card, pre-fills every field
// from what we know about the lead (parcel, sellers on deed, acreage, our offer),
// lets Jordan adjust the entity and terms, pick which uploaded map goes on the
// PDF, and write the seller-facing notes (type a take and clean it up, or leave
// it blank and let Claude write it from the offer). Then it renders + downloads
// the two-page offer PDF.

function initTerms(lead) {
  const o = resolveOffer(lead);
  const t = lead.offer_terms || {};
  return {
    buyerEntity: o.buyerEntity,
    parcelNumber: o.apn || '',
    namesOnDeed: o.namesOnDeed || '',
    county: o.county || '',
    state: o.state || '',
    roadName: o.roadName || '',
    useCategory: o.useCategory,
    purchasePrice: o.price || '',
    gisAcres: o.gisAcres || '',
    deededAcres: o.deededAcres || '',
    earnestMoney: o.earnest,
    depositDays: o.depositDays,
    closingDays: o.closingDays,
    weCoverClosing: !!t.weCoverClosing,
    weFurnishSurvey: !!t.weFurnishSurvey,
    contingencies: o.contingencies,
    appraisal: o.appraisal,
    possession: o.possession,
    termsCash: o.termsCash,
    preparedForName: o.preparedForName || '',
    preparedForNames: o.preparedForNames || '',
    preparedForCity: o.preparedForCity || '',
    presentedDate: o.presentedDate || '',
    validThrough: o.validThrough || '',
    offerNotes: t.offerNotes || '',
    offerMapUrl: o.mapUrl || '',
  };
}

function initMaps(lead) {
  if (Array.isArray(lead.lead_maps) && lead.lead_maps.length) return lead.lead_maps;
  if (lead.map_image_url) return [{ id: 'current', url: lead.map_image_url, label: 'Current map', kind: 'aerial' }];
  return [];
}

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</span>
    {children}
  </label>
);

const inputCls = 'w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:border-emerald-500 focus:outline-none';

export default function OfferModal({ lead, onClose, onSaved, showToast }) {
  const [terms, setTerms] = useState(() => initTerms(lead));
  const [maps, setMaps] = useState(() => initMaps(lead));
  const [draft, setDraft] = useState(lead.offer_terms?.dealNotesInternal || '');
  const [polishing, setPolishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [genMap, setGenMap] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [cropUrl, setCropUrl] = useState(null);
  const fileRef = useRef(null);

  const set = (k, v) => setTerms((p) => ({ ...p, [k]: v }));

  const perAcre = useMemo(() => {
    const price = Number(terms.purchasePrice) || 0;
    const ga = Number(terms.gisAcres) || 0;
    return ga > 0 ? Math.round(price / ga) : 0;
  }, [terms.purchasePrice, terms.gisAcres]);

  const money = (n) => (Number(n) > 0 ? '$' + Math.round(Number(n)).toLocaleString('en-US') : '—');

  // Build the terms payload we persist / send to the renderer.
  const payloadTerms = () => ({ ...terms, dealNotesInternal: draft });

  const persist = async (extra = {}) => {
    const nextTerms = { ...payloadTerms(), ...(extra.terms || {}) };
    const patch = { offer_terms: nextTerms, ...(extra.lead || {}) };
    const { error } = await supabase.from('leads').update(patch).eq('id', lead.id);
    if (error) throw error;
    onSaved?.({ ...lead, ...patch });
    return nextTerms;
  };

  const cleanUpNotes = async () => {
    setPolishing(true);
    try {
      const res = await fetch('/api/offer/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, draft, terms: payloadTerms() }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || 'Could not write the notes');
      set('offerNotes', d.notes);
      showToast?.(d.mode === 'polish' ? 'Cleaned up your notes' : 'Claude wrote the notes from the offer', 'success');
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setPolishing(false);
    }
  };

  const appendMaps = (entries) => {
    setMaps((prev) => {
      const next = [...prev.filter((m) => m.id !== 'current'), ...entries];
      // If nothing is chosen yet, select the newest upload for the PDF.
      if (!terms.offerMapUrl && entries[0]) set('offerMapUrl', entries[0].url);
      return next;
    });
  };

  const saveMapsToLead = async (nextMaps, newestUrl) => {
    const clean = nextMaps.filter((m) => m.id !== 'current');
    await supabase.from('leads')
      .update({ lead_maps: clean, map_uploaded: true, ...(newestUrl ? { map_image_url: newestUrl } : {}) })
      .eq('id', lead.id);
    onSaved?.({ ...lead, lead_maps: clean, map_uploaded: true, ...(newestUrl ? { map_image_url: newestUrl } : {}) });
  };

  const handleUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added = [];
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        const ext = file.name.split('.').pop() || 'png';
        const path = `${lead.id}/${Date.now()}-${Math.round(Math.random() * 1e4)}.${ext}`;
        const { error } = await supabase.storage.from('lead-maps').upload(path, file, { cacheControl: '3600', upsert: true });
        if (error) throw error;
        const { data } = supabase.storage.from('lead-maps').getPublicUrl(path);
        added.push({ id: path, url: data?.publicUrl, label: file.name.replace(/\.[^.]+$/, '').slice(0, 40), kind: 'upload' });
      }
      if (!added.length) { showToast?.('No images added', 'error'); return; }
      const next = [...maps.filter((m) => m.id !== 'current'), ...added];
      appendMaps(added);
      await saveMapsToLead(next, added[added.length - 1].url);
      showToast?.(`Added ${added.length} image${added.length > 1 ? 's' : ''}`, 'success');
    } catch (err) {
      showToast?.('Upload failed: ' + err.message, 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Save a cropped map (blob from ImageCropper) as a new image and select it.
  const handleCropped = async (blob) => {
    setCropUrl(null);
    setUploading(true);
    try {
      const path = `${lead.id}/${Date.now()}-crop.png`;
      const { error } = await supabase.storage.from('lead-maps').upload(path, blob, { cacheControl: '3600', upsert: true, contentType: 'image/png' });
      if (error) throw error;
      const { data } = supabase.storage.from('lead-maps').getPublicUrl(path);
      const entry = { id: path, url: data?.publicUrl, label: 'Cropped map', kind: 'crop' };
      const next = [...maps.filter((m) => m.id !== 'current'), entry];
      setMaps((prev) => [...prev.filter((m) => m.id !== 'current'), entry]);
      set('offerMapUrl', entry.url);
      await saveMapsToLead(next, entry.url);
      showToast?.('Cropped map added and selected', 'success');
    } catch (err) {
      showToast?.('Crop save failed: ' + err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const generateFromParcel = async () => {
    if (!lead.parcel_id) { showToast?.('This lead has no parcel ID to map from', 'error'); return; }
    setGenMap(true);
    try {
      const res = await fetch('/api/lead/save-map', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, apn: lead.parcel_id, state: terms.state, county: terms.county }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || 'Could not generate map');
      const entry = { id: d.url, url: d.url, label: 'Parcel aerial', kind: 'aerial' };
      const next = [...maps.filter((m) => m.id !== 'current'), entry];
      appendMaps([entry]);
      set('offerMapUrl', d.url);
      await saveMapsToLead(next, d.url);
      showToast?.('Generated aerial from parcel', 'success');
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setGenMap(false);
    }
  };

  const removeMap = (id) => setMaps((prev) => {
    const next = prev.filter((m) => m.id !== id);
    saveMapsToLead(next).catch(() => {});
    return next;
  });

  const downloadPdf = (url, filename) => {
    fetch(url).then((r) => r.blob()).then((blob) => {
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl; a.download = filename || 'Offer.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    }).catch(() => window.open(url, '_blank'));
  };

  const generatePdf = async () => {
    setGenerating(true);
    try {
      await persist();
      const res = await fetch('/api/offer/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, terms: payloadTerms(), mapUrl: terms.offerMapUrl }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || 'Could not generate the PDF');
      onSaved?.({ ...lead, offer_pdf_url: d.url });
      downloadPdf(d.url, d.filename);
      showToast?.('Offer PDF generated', 'success');
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl w-full max-w-3xl my-6 border border-slate-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 sticky top-0 bg-slate-800 rounded-t-xl z-10">
          <div>
            <h3 className="text-lg font-bold text-white">Produce Offer PDF</h3>
            <p className="text-xs text-slate-400">{terms.namesOnDeed || lead.full_name || lead.name || 'Lead'}{terms.parcelNumber ? ` · Parcel ${terms.parcelNumber}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Buyer & property */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">Buyer &amp; Property</h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Buyer entity"><input className={inputCls} value={terms.buyerEntity} onChange={(e) => set('buyerEntity', e.target.value)} /></Field>
              <Field label="Parcel number"><input className={inputCls} value={terms.parcelNumber} onChange={(e) => set('parcelNumber', e.target.value)} /></Field>
              <Field label="Sellers on deed"><input className={inputCls} value={terms.namesOnDeed} onChange={(e) => set('namesOnDeed', e.target.value)} placeholder="e.g. Arlen Hunt and Joyce Hunt" /></Field>
              <Field label="Use category"><input className={inputCls} value={terms.useCategory} onChange={(e) => set('useCategory', e.target.value)} /></Field>
              <Field label="County"><input className={inputCls} value={terms.county} onChange={(e) => set('county', e.target.value)} /></Field>
              <Field label="State"><input className={inputCls} value={terms.state} onChange={(e) => set('state', e.target.value)} /></Field>
              <Field label="Road / address (title line)"><input className={inputCls} value={terms.roadName} onChange={(e) => set('roadName', e.target.value)} placeholder="e.g. Darlington Road Northwest" /></Field>
            </div>
          </section>

          {/* Price & acres */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">Price &amp; Acres</h4>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Purchase price ($)"><input type="number" className={inputCls} value={terms.purchasePrice} onChange={(e) => set('purchasePrice', e.target.value)} /></Field>
              <Field label="GIS acres"><input type="number" step="0.01" className={inputCls} value={terms.gisAcres} onChange={(e) => set('gisAcres', e.target.value)} /></Field>
              <Field label="Deeded acres"><input type="number" step="0.01" className={inputCls} value={terms.deededAcres} onChange={(e) => set('deededAcres', e.target.value)} /></Field>
            </div>
            <p className="text-xs text-slate-400">Per GIS acre: <span className="text-emerald-400 font-semibold">{money(perAcre)}</span> · all cash</p>
          </section>

          {/* Terms */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">Terms</h4>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Earnest money ($)"><input type="number" className={inputCls} value={terms.earnestMoney} onChange={(e) => set('earnestMoney', e.target.value)} /></Field>
              <Field label="Deposit (business days)"><input type="number" className={inputCls} value={terms.depositDays} onChange={(e) => set('depositDays', e.target.value)} /></Field>
              <Field label="Close within (days)"><input type="number" className={inputCls} value={terms.closingDays} onChange={(e) => set('closingDays', e.target.value)} /></Field>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" className="w-4 h-4 accent-emerald-500" checked={terms.weCoverClosing} onChange={(e) => set('weCoverClosing', e.target.checked)} />
                We cover closing costs
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" className="w-4 h-4 accent-emerald-500" checked={terms.weFurnishSurvey} onChange={(e) => set('weFurnishSurvey', e.target.checked)} />
                We furnish the survey
              </label>
            </div>
          </section>

          {/* Prepared for */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">Prepared For</h4>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Header line"><input className={inputCls} value={terms.preparedForName} onChange={(e) => set('preparedForName', e.target.value)} placeholder="The Hunt Family" /></Field>
              <Field label="Names"><input className={inputCls} value={terms.preparedForNames} onChange={(e) => set('preparedForNames', e.target.value)} /></Field>
              <Field label="City"><input className={inputCls} value={terms.preparedForCity} onChange={(e) => set('preparedForCity', e.target.value)} /></Field>
              <Field label="Presented date"><input className={inputCls} value={terms.presentedDate} onChange={(e) => set('presentedDate', e.target.value)} /></Field>
              <Field label="Offer valid through"><input className={inputCls} value={terms.validThrough} onChange={(e) => set('validThrough', e.target.value)} /></Field>
            </div>
          </section>

          {/* Maps */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">Map for the PDF</h4>
              <div className="flex gap-2">
                <button onClick={generateFromParcel} disabled={genMap || !lead.parcel_id} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-xs font-semibold">
                  {genMap ? 'Generating…' : 'Generate from parcel'}
                </button>
                <button onClick={() => fileRef.current?.click()} disabled={uploading} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold">
                  {uploading ? 'Uploading…' : 'Upload image(s)'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleUpload(Array.from(e.target.files || []))} />
              </div>
            </div>
            {maps.length === 0 ? (
              <p className="text-xs text-slate-500">No maps yet. Upload a screenshot (aerial, subdivision map) or generate one from the parcel, then pick which goes on the offer.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {maps.map((m) => {
                  const selected = terms.offerMapUrl === m.url;
                  return (
                    <div key={m.id} className={`relative rounded-lg overflow-hidden border-2 cursor-pointer ${selected ? 'border-emerald-500' : 'border-slate-700'}`} onClick={() => set('offerMapUrl', m.url)}>
                      <img src={m.url} alt={m.label} className="w-full h-24 object-cover" />
                      <div className="flex items-center justify-between px-2 py-1 bg-slate-900/80">
                        <span className="text-[11px] text-slate-300 truncate">{m.label}</span>
                        <button onClick={(e) => { e.stopPropagation(); setCropUrl(m.url); }} className="text-[10px] font-semibold text-emerald-300 hover:text-emerald-200 shrink-0 ml-1">Crop</button>
                      </div>
                      {selected && <div className="absolute top-1 left-1 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">ON PDF</div>}
                      {m.id !== 'current' && (
                        <button onClick={(e) => { e.stopPropagation(); removeMap(m.id); }} className="absolute top-1 right-1 bg-black/70 hover:bg-red-600 text-white text-xs w-5 h-5 rounded-full leading-none">×</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Notes */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">Notes on this Offer</h4>
            <p className="text-xs text-slate-400">Type what you think about the deal (what you like, what you don’t, your angle), then Clean up. Anything negative or strategic stays internal, Claude only writes the seller-facing version. Leave it blank and Claude writes it from the offer.</p>
            <textarea className={`${inputCls} h-24 resize-y`} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Your take on the deal (internal, never shown to the seller)…" />
            <button onClick={cleanUpNotes} disabled={polishing} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-semibold">
              {polishing ? 'Writing…' : draft.trim() ? 'Clean up with Claude' : 'Let Claude write it'}
            </button>
            {terms.offerNotes && (
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Seller-facing notes (this goes on the PDF, editable)</span>
                <textarea className={`${inputCls} h-40 resize-y`} value={terms.offerNotes} onChange={(e) => set('offerNotes', e.target.value)} />
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-700 sticky bottom-0 bg-slate-800 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold">Cancel</button>
          <button
            onClick={async () => { try { await persist(); showToast?.('Offer saved', 'success'); } catch (e) { showToast?.(e.message, 'error'); } }}
            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold"
          >
            Save
          </button>
          <button onClick={generatePdf} disabled={generating} className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-semibold">
            {generating ? 'Generating PDF…' : 'Generate & Download PDF'}
          </button>
        </div>
      </div>

      {cropUrl && (
        <ImageCropper url={cropUrl} onCancel={() => setCropUrl(null)} onApply={handleCropped} />
      )}
    </div>
  );
}
