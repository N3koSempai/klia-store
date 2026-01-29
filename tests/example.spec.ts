import { test, expect } from '@playwright/test';

test.describe('Klia Store App', () => {
  test('should load the application', async ({ page }) => {
    // Navega a la app en desarrollo
    await page.goto('http://localhost:1420');

    // Verifica que la página cargó
    await expect(page).toHaveTitle(/Klia Store/i);

    // Aquí puedes agregar tus tests específicos
    // Por ejemplo:
    // await expect(page.locator('h1')).toBeVisible();
    // await page.locator('button').click();
  });
});
