import { expect, test } from "@playwright/test";

test.describe("frontend smoke flows", () => {
  test("login page renders key auth controls @smoke", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Gentle Stream" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Google" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Facebook" })
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  });

  test("legal pages are publicly reachable @smoke", async ({ page }) => {
    await page.goto("/terms");
    await expect(
      page.getByRole("heading", { name: /Terms of service/i, level: 1 })
    ).toBeVisible();

    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { name: /Privacy policy/i, level: 1 })
    ).toBeVisible();

    await page.goto("/data-deletion");
    await expect(
      page.getByRole("heading", { name: /User data deletion/i, level: 1 })
    ).toBeVisible();
  });

  test("login links to legal pages", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: "Privacy", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Data deletion" })).toBeVisible();
  });

  test("login social buttons remain visible across browsers", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Facebook" })
    ).toBeVisible();
  });
});
