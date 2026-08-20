import { useContext } from "react";

import { AuthContext, type AuthContextValue } from "./authContextValue";

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AUTH_PROVIDER_MISSING");
  return value;
}
