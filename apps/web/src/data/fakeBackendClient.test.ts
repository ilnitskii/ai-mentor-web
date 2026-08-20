import { FakeBackendClient } from "./fakeBackendClient";

describe("FakeBackendClient", () => {
  it("supports the auth contract without remote credentials", async () => {
    const client = new FakeBackendClient();

    expect(await client.getCurrentUser()).toBeNull();
    await expect(
      client.signIn("Learner", "synthetic-password"),
    ).resolves.toEqual({
      id: "local-demo-learner",
      username: "learner",
      displayName: "Learner",
    });
    await client.signOut();
    expect(await client.getCurrentUser()).toBeNull();
  });

  it("notifies subscribers when the session changes", async () => {
    const client = new FakeBackendClient();
    const listener = vi.fn();
    const unsubscribe = client.onAuthStateChange(listener);

    await client.signIn("Learner", "synthetic-password");
    await client.signOut();
    unsubscribe();

    expect(listener).toHaveBeenNthCalledWith(1, {
      id: "local-demo-learner",
      username: "learner",
      displayName: "Learner",
    });
    expect(listener).toHaveBeenNthCalledWith(2, null);
  });
});
