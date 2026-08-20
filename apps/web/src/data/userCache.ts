export interface UserCache {
  clearUserData(userId: string): Promise<void>;
}

export class CompositeUserCache implements UserCache {
  constructor(private readonly caches: UserCache[]) {}

  async clearUserData(userId: string): Promise<void> {
    await Promise.all(this.caches.map((cache) => cache.clearUserData(userId)));
  }
}

const storagePrefix = (userId: string) => `ai-mentor:user:${userId}:`;
const cachePrefix = (userId: string) => `ai-mentor-user:${userId}:`;

function clearStorage(storage: Storage, prefix: string) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}

export class BrowserUserCache implements UserCache {
  async clearUserData(userId: string): Promise<void> {
    clearStorage(window.localStorage, storagePrefix(userId));
    clearStorage(window.sessionStorage, storagePrefix(userId));

    if ("caches" in window) {
      const names = await window.caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(cachePrefix(userId)))
          .map((name) => window.caches.delete(name)),
      );
    }
  }
}

export class MemoryUserCache implements UserCache {
  readonly clearedUserIds: string[] = [];

  async clearUserData(userId: string): Promise<void> {
    this.clearedUserIds.push(userId);
  }
}
