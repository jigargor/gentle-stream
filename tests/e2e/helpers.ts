import type { Page } from "@playwright/test";

const COOKIE_CONSENT_STORAGE_KEY = "gs_cookie_consent_v1";

/** Prevent the cookie notice dialog from blocking smoke-test clicks. */
export async function seedCookieConsent(page: Page): Promise<void> {
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 1,
        essential: true,
        analytics: false,
        mode: "reject_all",
        updatedAt: new Date().toISOString(),
      })
    );
  }, COOKIE_CONSENT_STORAGE_KEY);
}

/** Dismiss the cookie notice if it still appears (fallback). */
export async function dismissCookieNoticeIfPresent(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Cookie notice" });
  if (await dialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByRole("button", { name: "Reject all" }).click();
    await dialog.waitFor({ state: "hidden", timeout: 5_000 });
  }
}
