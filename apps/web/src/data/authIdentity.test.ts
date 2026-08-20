import {
  normalizeUsername,
  usernameToAuthEmail,
  validateUsername,
} from "./authIdentity";

describe("username identity", () => {
  it("normalizes equivalent names to one private auth email", async () => {
    expect(normalizeUsername("  Алиса   DATA ")).toBe("алиса data");
    await expect(usernameToAuthEmail("Алиса DATA")).resolves.toBe(
      await usernameToAuthEmail("  алиса   data "),
    );
  });

  it("rejects unsafe or ambiguous usernames", () => {
    expect(() => validateUsername("a")).toThrow("AUTH_USERNAME_INVALID");
    expect(() => validateUsername("alice@example.com")).toThrow(
      "AUTH_USERNAME_INVALID",
    );
  });
});
