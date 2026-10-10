import { supabase } from '@/lib/supabase';

export const PUBLIC_SITE_URL = (process.env.NEXT_PUBLIC_PUBLIC_SITE_URL || '').replace(/\/$/, '');

/** Throws the Supabase error, otherwise returns the data. */
export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export function slugify(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/** Gmail compose URL, opened in a new tab for replies (pre-fills recipient and subject). */
export function gmailComposeUrl({ to, subject = '', body = '' }) {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to, su: subject });
  if (body) params.set('body', body);
  return `https://mail.google.com/mail/?${params}`;
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Uploads an image to the public `media` bucket and returns its public URL. */
export async function uploadImage(file, folder = 'articles') {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${folder}/${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
  });
  if (error) throw error;
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}
