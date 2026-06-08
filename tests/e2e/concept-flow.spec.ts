import { test, expect } from '@playwright/test';

test.describe('Concept Generation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/concept');
  });

  test('page loads concept generation UI', async ({ page }) => {
    await expect(page.getByText('Concept Generation')).toBeVisible();
    await expect(page.getByText('Configure Run')).toBeVisible();
  });

  test('shows empty state when no runs exist', async ({ page }) => {
    await expect(
      page.getByText('Configure and run a prompt to see results here.')
    ).toBeVisible();
  });

  test('run button disabled without selections', async ({ page }) => {
    const runButton = page.getByRole('button', { name: /Run/ });
    await expect(runButton).toBeDisabled();
  });
});
