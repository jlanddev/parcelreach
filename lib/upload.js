'use client';
import { supabase } from '@/lib/supabase';

/**
 * Upload a file to the public `lead-files` bucket and return its public URL.
 * Used for SMS media (Project Blue mediaAttachmentUrl) and note attachments.
 */
export async function uploadToLeadFiles(file, prefix = 'attachments') {
  const safe = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${prefix}/${Date.now()}-${Math.round(Math.random() * 1e6)}-${safe}`;
  const { error } = await supabase.storage.from('lead-files').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('lead-files').getPublicUrl(path);
  return { url: data.publicUrl, type: file.type || '', name: file.name || 'file' };
}

export const isImageType = (t) => /^image\//.test(t || '');
export const isAudioType = (t) => /^audio\//.test(t || '');
export const isImageUrl = (u) => /\.(png|jpe?g|gif|webp|heic|bmp)(\?|$)/i.test(u || '');
