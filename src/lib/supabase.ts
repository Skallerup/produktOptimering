import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let cachedClient:
  | ReturnType<typeof createClient<Database>>
  | null = null;

export function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase environment variables are missing. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  if (!cachedClient) {
    cachedClient = createClient<Database>(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return cachedClient;
}

