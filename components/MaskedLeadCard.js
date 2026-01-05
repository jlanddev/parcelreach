'use client';

export default function MaskedLeadCard({ lead, onPurchase, userRole, isPurchasing }) {
  const canPurchase = userRole === 'owner' || userRole === 'executive';
  return (
    <div className={`bg-gradient-to-br from-green-900/20 to-blue-900/20 backdrop-blur-sm border rounded-lg p-3 transition-all group relative ${isPurchasing ? 'border-yellow-500/50' : 'border-green-500/30 hover:border-green-400/50'}`}>
      {/* Processing Overlay */}
      {isPurchasing && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-lg z-20 flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin mb-3"></div>
          <div className="text-green-400 font-bold text-sm">Processing Payment...</div>
          <div className="w-32 h-1 bg-slate-700 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-green-500 rounded-full animate-pulse" style={{ width: '60%' }}></div>
          </div>
        </div>
      )}

      {/* "FOR SALE" Badge */}
      <div className={`absolute top-2 right-2 text-white text-[10px] font-bold px-2 py-1 rounded uppercase shadow-lg ${isPurchasing ? 'bg-yellow-500' : 'bg-green-500'}`}>
        {isPurchasing ? 'Processing' : 'For Sale'}
      </div>

      <div className="flex gap-3">
        {/* Left Column - Lead Info */}
        <div className="flex-1 min-w-0">
          {/* Location (County, State) */}
          <div className="mb-2">
            <div className="font-bold text-white text-base">
              {(lead.county || lead.propertyCounty || 'Unknown').replace(/ County$/i, '')} County, {lead.state || lead.propertyState || 'TX'}
            </div>
            <div className="flex items-center gap-1 text-xs text-green-400 mt-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
              </svg>
              <span className="font-bold">${lead.price}</span>
            </div>
          </div>

          {/* Acreage */}
          <div className="flex gap-2 mb-2">
            <div className="bg-orange-500/10 border border-orange-500/30 px-2 py-1 rounded flex-1">
              <div className="text-[10px] text-slate-400 uppercase">Acres</div>
              <div className="text-xs font-bold text-orange-400">
                {lead.acres > 0 ? lead.acres.toFixed(1) : 'N/A'}
              </div>
            </div>
          </div>

          {/* Purchase Button */}
          {canPurchase ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isPurchasing) onPurchase(lead);
              }}
              disabled={isPurchasing}
              className={`w-full text-white font-bold py-2 px-3 rounded-lg text-sm shadow-lg transition-all ${isPurchasing ? 'bg-yellow-600 cursor-wait' : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 active:scale-95'}`}
            >
              {isPurchasing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                `Purchase Lead - $${lead.price}`
              )}
            </button>
          ) : (
            <div className="w-full bg-slate-700/50 text-slate-400 font-bold py-2 px-3 rounded-lg text-sm text-center cursor-not-allowed">
              <div className="text-xs mb-1">Owner/Executive Only</div>
              <div>${lead.price}</div>
            </div>
          )}
        </div>

        {/* Right Column - Premium Blurred Map Preview */}
        <div className="w-20 flex-shrink-0">
          <div className="relative border border-green-500/40 rounded overflow-hidden h-full bg-gradient-to-br from-slate-800 to-slate-900">
            {lead.latitude && lead.longitude ? (
              <>
                <img
                  src={`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${lead.longitude},${lead.latitude},10,0/80x80@2x?logo=false&attribution=false&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`}
                  alt="Approximate area"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{
                    filter: 'blur(12px) brightness(0.7)',
                    transform: 'scale(1.1)'
                  }}
                />
                {/* Premium gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-blue-500/10" />

                {/* Glass morphism effect */}
                <div className="absolute inset-0 backdrop-blur-sm bg-white/5" />

                {/* Lock Icon with glow */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-green-400/20 blur-xl rounded-full" />
                    <svg className="w-8 h-8 text-green-400 relative drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 bg-slate-700/50 flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
