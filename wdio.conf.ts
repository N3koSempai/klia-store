import type { Options } from '@wdio/types';

export const config: Options.Testrunner = {
    runner: 'local',
    specs: ['./tests/webdriver/**/*.spec.ts'],
    maxInstances: 1,
    capabilities: [{
        maxInstances: 1,
        'tauri:options': {
            application: '/home/gatorand/Documentos/mis-proyectos/kliaStore/src-tauri/target/release/klia-store',
        },
    }],
    logLevel: 'info',
    bail: 0,
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,
    framework: 'mocha',
    reporters: ['spec'],
    mochaOpts: {
        ui: 'bdd',
        timeout: 60000,
    },
    port: 4444,
    host: '127.0.0.1',
};
