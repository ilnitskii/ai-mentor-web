import type { BackendClient } from "./backendClient";
import type { MentorDatabase } from "./mentorDatabase";
import type { OfflineStore } from "./offlineStore";
import type { UserCache } from "./userCache";

export interface BackendServices {
  auth: BackendClient;
  database: MentorDatabase;
  offline: OfflineStore;
  userCache: UserCache;
}
