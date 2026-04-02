export * from "./types";
export * from "./web-local-storage";

import type { StorageAdapter } from "./types";

const memoryStore = new Map<string, string>();

export const memoryStorageAdapter: StorageAdapter = {
  get(key: string) {
    return memoryStore.get(key) ?? null;
  },
  set(key: string, value: string) {
    memoryStore.set(key, value);
  },
  remove(key: string) {
    memoryStore.delete(key);
  },
};
