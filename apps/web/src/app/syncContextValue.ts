import { createContext } from "react";

export type SyncErrorCode = "EVENT_CONFLICT" | "NETWORK_UNAVAILABLE" | null;

export interface SyncContextValue {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  lastSuccessfulSync: string | null;
  errorCode: SyncErrorCode;
  syncNow(): Promise<void>;
  refreshPending(): Promise<void>;
}

export const SyncContext = createContext<SyncContextValue | null>(null);
