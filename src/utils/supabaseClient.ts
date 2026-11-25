import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 👇 請在這裡填入你的 Supabase Project URL 與 anon public 金鑰（填入後同學打開網站就能直接用）
export const DEFAULT_SUPABASE_URL = 'https://euxdmlawfvamttwntede.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1eGRtbGF3ZnZhbXR0d250ZWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2MTQ1MzAsImV4cCI6MjExMTE5MDUzMH0.u4w__cT2_Nn9zOyzWQExGjxIZdo7ODykQp1qs1qvNAk';

const URL_STORAGE_KEY = 'litlib.supabaseUrl';
const KEY_STORAGE_KEY = 'litlib.supabaseAnonKey';

let cachedClient: SupabaseClient | null = null;
let cachedSignature = '';

export function getSupabaseConfig(): { url: string; anonKey: string } {
  let localUrl = '';
  let localKey = '';
  try {
    localUrl = (localStorage.getItem(URL_STORAGE_KEY) || '').trim();
    localKey = (localStorage.getItem(KEY_STORAGE_KEY) || '').trim();
  } catch {
    // 忽略儲存空間讀取失敗
  }
  return {
    url: DEFAULT_SUPABASE_URL.trim() || localUrl,
    anonKey: DEFAULT_SUPABASE_ANON_KEY.trim() || localKey,
  };
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  localStorage.setItem(URL_STORAGE_KEY, url.trim());
  localStorage.setItem(KEY_STORAGE_KEY, anonKey.trim());
  cachedClient = null;
  cachedSignature = '';
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
}

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;

  const sig = `${url}|${anonKey}`;
  if (cachedClient && cachedSignature === sig) {
    return cachedClient;
  }

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  cachedSignature = sig;
  return cachedClient;
}
