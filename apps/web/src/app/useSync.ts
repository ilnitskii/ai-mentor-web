import { useContext } from "react";

import { SyncContext, type SyncContextValue } from "./syncContextValue";

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error("SYNC_PROVIDER_MISSING");
  return value;
}
