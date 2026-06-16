import { expect, test } from "@playwright/test";

test.describe("sudoku game @app", () => {
  test("loads puzzle and undo restores after a mistake @smoke", async ({ page }) => {
    await page.goto("/e2e-harness/sudoku");

    await expect(page.getByText("Setting the grid", { exact: false })).toBeHidden({
      timeout: 60_000,
    });
    await expect(page.getByText("Sudoku", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Mistakes 0/3")).toBeVisible();

    const emptyCell = page.getByLabel(/empty$/).first();
    await emptyCell.click();

    let mistakeRecorded = false;
    for (const digit of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      await page.getByRole("button", { name: `Enter ${digit}` }).click();
      if (await page.getByText("Mistakes 1/3").isVisible().catch(() => false)) {
        mistakeRecorded = true;
        break;
      }
      await page.getByRole("button", { name: "Erase" }).click();
    }

    expect(mistakeRecorded).toBe(true);
    await expect(page.getByRole("button", { name: "Undo last mistake" })).toBeVisible();
    await page.getByRole("button", { name: "Undo last mistake" }).click();
    await expect(page.getByText("Mistakes 0/3")).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo last mistake" })).toHaveCount(0);
  });
});
