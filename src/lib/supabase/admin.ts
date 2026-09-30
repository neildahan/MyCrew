import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        // Next 14's App Router caches fetch() by default, and supabase-js goes
        // through global fetch. Without this, a cron route re-reading the same
        // query gets the first response back instead of current rows — which
        // showed up as a morning digest reporting no tasks when tasks existed.
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}
