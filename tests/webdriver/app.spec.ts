import { browser } from '@wdio/globals';

describe('Klia Store App - WebDriver', () => {
    it('should load the Tauri application', async () => {
        // Espera a que la ventana esté visible
        await browser.pause(2000);

        // Obtiene el título de la ventana
        const title = await browser.getTitle();

        // Verifica que la aplicación cargó
        expect(title).toContain('Klia Store');
    });

    it('should interact with the application', async () => {
        // Ejemplo: encontrar un elemento y hacer click
        // const button = await $('button');
        // await button.waitForExist({ timeout: 5000 });
        // await button.click();

        // Aquí puedes agregar tus tests específicos de la app
        await browser.pause(1000);
    });
});
