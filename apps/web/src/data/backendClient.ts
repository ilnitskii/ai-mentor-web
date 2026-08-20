export type BackendMode = "fake" | "supabase";

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
}

export interface BackendClient {
  readonly mode: BackendMode;
  getCurrentUser(): Promise<SessionUser | null>;
  signIn(username: string, password: string): Promise<SessionUser>;
  signUp(username: string, password: string): Promise<SessionUser>;
  signOut(): Promise<void>;
  onAuthStateChange(listener: (user: SessionUser | null) => void): () => void;
}
