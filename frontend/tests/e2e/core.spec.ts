import { expect, test } from "@playwright/test";

test("home offers map and court creation", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /НАЙДИ ПЛОЩАДКУ/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Открыть карту/ }).first(),
  ).toHaveAttribute("href", "/map");
  await expect(
    page.getByRole("link", { name: /Добавить площадку/ }).first(),
  ).toHaveAttribute("href", "/courts/add");
});

test("court wizard requires a map point", async ({ page }) => {
  await page.goto("/courts/add");
  await page.getByRole("button", { name: /Далее/ }).click();
  await expect(page.getByText(/Нажмите на точку площадки/)).toBeVisible();
});

test("mobile navigation is available", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Карта/ }).last()).toBeVisible();
  await expect(page.getByRole("link", { name: /Игры/ }).last()).toBeVisible();
});

test("map filters can be opened and changed", async ({ page }) => {
  await page.goto("/map");

  const trigger = page.locator('button[aria-label="Фильтры"]:visible');
  await trigger.click();

  const panel = page.locator('[id$="map-filters"]:visible');
  await expect(panel.getByText("Фильтры площадок")).toBeVisible();
  await panel.getByLabel("Покрытие").selectOption("rubber");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(trigger.getByText("1")).toBeVisible();
});
