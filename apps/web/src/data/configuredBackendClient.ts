import type { BackendServices } from "./backendServices";
import { createFakeBackendServices } from "./fakeBackendClient";
import { IndexedDbOfflineStore } from "./offlineStore";
import { createSupabaseBackendServices } from "./supabaseBackendClient";

export function createConfiguredBackendServices(): BackendServices {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (url && publishableKey)
    return createSupabaseBackendServices(url, publishableKey);
  return createFakeBackendServices(
    null,
    undefined,
    new IndexedDbOfflineStore(),
  );
}
