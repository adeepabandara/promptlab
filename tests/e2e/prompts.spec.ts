import { test, expect } from '@playwright/test';

test.describe('Prompt Management', () => {
  test.beforeEach(async ({ page }) => {
    // Assumes a logged-in session exists via storage state
    await page.goto('/prompts');
  });

  test('create new prompt', async ({ page }) => {
    await page.getByRole('button', { name: 'New Prompt' }).click();
    await page.fill('input[id="name"], input[placeholder="My prompt"]', 'Test Prompt E2E');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Prompt created')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Test Prompt E2E')).toBeVisible();
  });

  test('open prompt editor', async ({ page }) => {
    await page.getByText('Test Prompt E2E').click();
    await expect(page).toHaveURL(/\/prompts\/.+/);
  });

  test('save as new version with changelog', async ({ page }) => {
    await page.getByText('Test Prompt E2E').click();
    // Type in CodeMirror editor
    await page.locator('.cm-content').click();
    await page.keyboard.type('Hello {{name}}, your product is {{product}}.');
    await page.getByRole('button', { name: 'Save as new version' }).click();
    await page.fill('textarea', 'Initial version with two variables');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved as v')).toBeVisible({ timeout: 5000 });
  });
});
