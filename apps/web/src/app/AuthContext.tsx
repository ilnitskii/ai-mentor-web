import { type PropsWithChildren, useEffect, useMemo, useState } from "react";

import type { BackendClient, SessionUser } from "../data/backendClient";
import type { UserCache } from "../data/userCache";
import { AuthContext, type AuthContextValue } from "./authContextValue";

interface AuthProviderProps extends PropsWithChildren {
  authClient: BackendClient;
  userCache: UserCache;
}

export function AuthProvider({
  authClient,
  userCache,
  children,
}: AuthProviderProps) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = authClient.onAuthStateChange((nextUser) => {
      if (active) setUser(nextUser);
    });

    void authClient
      .getCurrentUser()
      .then((nextUser) => {
        if (active) setUser(nextUser);
      })
      .catch(() => {
        if (active) setErrorCode("AUTH_REQUIRED");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [authClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: loading ? "loading" : user ? "authenticated" : "anonymous",
      user,
      errorCode,
      pending,
      async signIn(username, password) {
        setPending(true);
        setErrorCode(null);
        try {
          const nextUser = await authClient.signIn(username, password);
          setUser(nextUser);
        } catch (error) {
          const code =
            error instanceof Error && error.message === "AUTH_USERNAME_INVALID"
              ? error.message
              : "AUTH_INVALID_CREDENTIALS";
          setErrorCode(code);
          throw new Error(code, { cause: error });
        } finally {
          setPending(false);
        }
      },
      async signUp(username, password) {
        setPending(true);
        setErrorCode(null);
        try {
          const nextUser = await authClient.signUp(username, password);
          setUser(nextUser);
        } catch (error) {
          const safeCodes = new Set([
            "AUTH_USERNAME_INVALID",
            "AUTH_USERNAME_TAKEN",
            "AUTH_WEAK_PASSWORD",
            "AUTH_SIGNUP_DISABLED",
            "AUTH_SIGNUP_CONFIRMATION_REQUIRED",
          ]);
          const code =
            error instanceof Error && safeCodes.has(error.message)
              ? error.message
              : "AUTH_SIGNUP_FAILED";
          setErrorCode(code);
          throw new Error(code, { cause: error });
        } finally {
          setPending(false);
        }
      },
      async signOut() {
        if (!user) return;
        setPending(true);
        setErrorCode(null);
        try {
          await authClient.signOut();
          await userCache.clearUserData(user.id);
          setUser(null);
        } catch {
          setErrorCode("AUTH_SIGN_OUT_FAILED");
          throw new Error("AUTH_SIGN_OUT_FAILED");
        } finally {
          setPending(false);
        }
      },
    }),
    [authClient, errorCode, loading, pending, user, userCache],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
