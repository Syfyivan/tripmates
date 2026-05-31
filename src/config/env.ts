declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

const env = typeof process === 'undefined' ? {} : process.env ?? {};

export const supabaseConfig = {
  url: env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  publishableKey:
    env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export const isSupabaseConfigured = Boolean(
  supabaseConfig.url && supabaseConfig.publishableKey,
);
