import { test, expect } from '@playwright/test';

const TEST_EMAIL = `test+${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

test.describe('Authentication', () => {
  test('register new user → redirected to /concept', async ({ page }) => {
    await page.goto('/register');
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.fill('#confirm', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/concept/, { timeout: 10000 });
  });

  test('login with valid credentials → success', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/concept/, { timeout: 10000 });
  });

  test('login with invalid credentials → error message', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'wrong@example.com');
    await page.fill('#password', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('p.text-red-500')).toBeVisible({ timeout: 5000 });
  });

  test('logout → redirected to /login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/concept/);
    await page.getByText('Sign out').click();
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('unauthenticated access to /concept → redirect to /login', async ({ page }) => {
    await page.goto('/concept');
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});
