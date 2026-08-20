const usernamePattern = /^[\p{L}\p{N}._ -]+$/u;

export function normalizeUsername(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ");
}

export function validateUsername(value: string): string {
  const normalized = normalizeUsername(value);
  if (
    normalized.length < 2 ||
    normalized.length > 40 ||
    !usernamePattern.test(normalized)
  )
    throw new Error("AUTH_USERNAME_INVALID");
  return normalized;
}

export async function usernameToAuthEmail(value: string): Promise<string> {
  const username = validateUsername(value);
  const bytes = new TextEncoder().encode(username);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `u${hex.slice(0, 63)}@users.ai-mentor.invalid`;
}
