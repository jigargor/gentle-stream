import { expect, test } from "@playwright/test";

test.describe("guest browsing @app", () => {
  test("continue as guest reaches feed without MFA gate @smoke", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("button", { name: "Continue as guest" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue as guest" }).click();

    await expect(page).toHaveURL(/\/(\?.*)?$/);
    await expect(
      page.getByText("Powered by AI", { exact: false })
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("Enter the passcode from your authenticator app")
    ).toHaveCount(0);
  });
});
