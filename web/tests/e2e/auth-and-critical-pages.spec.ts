import { expect, test } from "@playwright/test";

test("login page renders", async ({ page }) => {
  await page.goto("/login");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Sign in to SEM Brain", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

for (const route of ["/", "/dashboard", "/goals", "/board", "/tasks", "/approvals", "/chat"]) {
  test(`unauthenticated access to ${route} is redirected`, async ({ page }) => {
    await page.goto(route);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Sign in to SEM Brain", { exact: true })).toBeVisible();
  });
}
