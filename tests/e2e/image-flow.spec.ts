import { test, expect } from '@playwright/test';

test.describe('Image Generation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/image-gen');
  });

  test('page loads image generation UI', async ({ page }) => {
    await expect(page.getByText('Image Generation')).toBeVisible();
    await expect(page.getByText('Configure Run')).toBeVisible();
  });

  test('JSON validator shows invalid badge for bad JSON', async ({ page }) => {
    const textarea = page.locator('textarea[placeholder*="product"]');
    await textarea.fill('this is not json');
    await expect(page.getByText('Invalid JSON')).toBeVisible();
  });

  test('JSON validator shows valid badge for good JSON', async ({ page }) => {
    const textarea = page.locator('textarea[placeholder*="product"]');
    await textarea.fill('{"product": "sneakers", "style": "minimalist"}');
    await expect(page.getByText('Valid JSON')).toBeVisible();
  });

  test('generate button disabled without selections', async ({ page }) => {
    const btn = page.getByRole('button', { name: /Generate Images/ });
    await expect(btn).toBeDisabled();
  });
});
