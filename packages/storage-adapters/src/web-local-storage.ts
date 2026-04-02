import type { StorageAdapter } from "./types";

export const webLocalStorageAdapter: StorageAdapter = {
  async get(key) {
    if (typeof window === "undefined") return null;
    const value = window.localStorage.getItem(key);
    return value;
  },
  async set(key, value) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  },
  async remove(key) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  },
};
