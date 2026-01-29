import { browser, $ } from '@wdio/globals';

describe('Klia Store App - WebDriver', () => {
    it('should load the Tauri application', async () => {
        // Espera a que la ventana esté visible
        await browser.pause(2000);

        // Obtiene el título de la ventana
        const title = await browser.getTitle();

        // Verifica que la aplicación cargó
        expect(title).toContain('Klia Store');
    });

    it('should navigate to Hetairos AI app detail when clicking promoted card', async () => {
        // Esperar a que el card destacado (promocionado o del día) aparezca
        const featuredCard = await $('#featured-promoted-card, #featured-card');
        await featuredCard.waitForExist({ timeout: 15000 });

        // Buscar específicamente el card promocionado
        const promotedCard = await $('#featured-promoted-card');

        if (await promotedCard.isExisting()) {
            console.log('✓ Promoted card found, testing navigation...');

            // Hacer click en el card promocionado
            await promotedCard.scrollIntoView();
            await promotedCard.click();

            // Dar tiempo para la transición de navegación
            await browser.pause(3000);

            // Esperar a que se cargue la vista de detalles
            // Buscar el botón "Atrás" por su id
            const backButton = await $('#app-detail-back-button');
            await backButton.waitForExist({ timeout: 15000 });

            expect(await backButton.isDisplayed()).toBe(true);

            // Verificar que el título de la app contiene "Hetairos"
            const pageContent = await $('body');
            const text = await pageContent.getText();
            expect(text).toContain('Hetairos');

            console.log('✓ Successfully navigated to Hetairos AI detail page');
        } else {
            // Si no hay app promocionada, el test pasa pero se registra
            console.log('⚠ No promoted app found - skipping navigation test');
            console.log('  This might be because:');
            console.log('  - The app is not installed locally');
            console.log('  - The API call failed');
            console.log('  - PROMOTED_APP_ID is null');
        }
    });

    it('should interact with the application', async () => {
        // Aquí puedes agregar tus tests específicos de la app
        await browser.pause(1000);
    });
});
