import { beforeEach, describe, expect, it } from "vitest";
import {
  memoryStorageAdapter,
  webLocalStorageAdapter,
} from "@gentle-stream/storage-adapters";

class LocalStorageMock {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}

describe("storage adapters", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = undefined;
  });

  it("memory storage adapter supports set/get/remove", () => {
    expect(memoryStorageAdapter.get("k")).toBeNull();
    memoryStorageAdapter.set("k", "v");
    expect(memoryStorageAdapter.get("k")).toBe("v");
    memoryStorageAdapter.remove("k");
    expect(memoryStorageAdapter.get("k")).toBeNull();
  });

  it("web local storage adapter no-ops without window", async () => {
    await webLocalStorageAdapter.set("k", "v");
    await expect(webLocalStorageAdapter.get("k")).resolves.toBeNull();
    await webLocalStorageAdapter.remove("k");
  });

  it("web local storage adapter uses window.localStorage when present", async () => {
    const localStorage = new LocalStorageMock();
    (
      globalThis as unknown as {
        window?: { localStorage: LocalStorageMock };
      }
    ).window = { localStorage };

    await webLocalStorageAdapter.set("theme", "dark");
    await expect(webLocalStorageAdapter.get("theme")).resolves.toBe("dark");
    await webLocalStorageAdapter.remove("theme");
    await expect(webLocalStorageAdapter.get("theme")).resolves.toBeNull();
  });
});
