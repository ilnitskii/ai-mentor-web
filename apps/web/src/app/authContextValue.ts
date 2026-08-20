import { createContext } from "react";

import type { SessionUser } from "../data/backendClient";

export interface AuthContextValue {
  status: "loading" | "anonymous" | "authenticated";
  user: SessionUser | null;
  errorCode: string | null;
  pending: boolean;
  signIn(username: string, password: string): Promise<void>;
  signUp(username: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
