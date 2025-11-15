import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Calculate platform price for a lead
 * Uses Google Ads cost + margin, or falls back to default
 */
export async function calculateLeadPrice(googleAdsCost = null) {
  try {
    // Get platform settings
    const { data: settings } = await supabase
      .from('platform_settings')
      .select('*');

    const settingsMap = {};
    settings?.forEach(s => {
      settingsMap[s.setting_key] = parseFloat(s.setting_value) || s.setting_value;
    });

    // Get cost per lead
    let costPerLead = googleAdsCost;

    if (!costPerLead) {
      // Use fallback (we'll integrate Google Ads API later)
      costPerLead = settingsMap.fallback_cost_per_lead || 25.00;
    }

    // Apply margin
    const margin = settingsMap.platform_margin || 0.20;
    const platformPrice = costPerLead * (1 + margin);

    return {
      googleAdsCost: costPerLead,
      margin: margin,
      platformPrice: Math.round(platformPrice * 100) / 100
    };
  } catch (error) {
    console.error('Error calculating lead price:', error);
    // Fallback
    return {
      googleAdsCost: 25.00,
      margin: 0.20,
      platformPrice: 30.00
    };
  }
}

/**
 * Record lead cost in database
 */
export async function recordLeadCost(leadId, contractorId, pricing) {
  const { error } = await supabase
    .from('lead_costs')
    .insert([{
      lead_id: leadId,
      contractor_id: contractorId,
      google_ads_cost: pricing.googleAdsCost,
      margin_applied: pricing.margin,
      platform_price: pricing.platformPrice,
    }]);

  if (error) {
    console.error('Error recording lead cost:', error);
    return false;
  }

  return true;
}
