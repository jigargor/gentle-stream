export * from "./types";
export * from "./web-local-storage";

import type { StorageAdapter } from "./types";

export const memoryStorageAdapter: StorageAdapter = {
  get() {
    return null;
  },
  set() {
    // no-op placeholder for boundary initialization
  },
  remove() {
    // no-op placeholder for boundary initialization
  },
};
