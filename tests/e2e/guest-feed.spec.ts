import { expect, test } from "@playwright/test";
import { seedCookieConsent } from "./helpers";

test.describe("guest browsing @app", () => {
  test("continue as guest reaches feed without MFA gate @smoke", async ({ page }) => {
    test.setTimeout(90_000);

    await seedCookieConsent(page);
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("button", { name: "Continue as guest" })
    ).toBeVisible();

    await Promise.all([
      page.waitForURL((url) => new URL(url).pathname === "/", {
        timeout: 60_000,
        waitUntil: "domcontentloaded",
      }),
      page.getByRole("button", { name: "Continue as guest" }).click(),
    ]);

    await expect(page.getByRole("button", { name: "Open guest menu" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Powered by AI", { exact: false })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("Enter the passcode from your authenticator app")
    ).toHaveCount(0);
  });
});
