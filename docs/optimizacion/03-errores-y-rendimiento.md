# Eje 3 — Errores generales y optimizaciones de rendimiento

Auditoría de `src/` y `src-tauri/` enfocada en antipatrones de React, cascadas de red N+1, manejo de errores y código muerto/duplicado que afecta mantenibilidad y rendimiento.

---

## Red — llamadas N+1 reales

### `useAppsOfTheWeek.ts:66-77` — cascada de requests
```ts
const appsWithDetails = await Promise.all(
  response.apps.map(async (app) => {
    const categoryApp = await apiService.getCategoryApp(app.app_id);
    ...
  }),
);
```
1 request inicial (`getAppsOfTheWeek`) + N requests en paralelo, uno por cada app de la semana, cada uno un POST `/search` individual (`getCategoryApp`, `src/services/api.ts:77-93`). La misma API ya soporta filtros batch — patrón usado en `getDeveloperApps` (`api.ts:99-107`, `filters: [{ filterType: "developer_name", value }]`).
**Acción:** sustituir por una única búsqueda con filtro `app_id IN [...]`, o como mínimo limitar la concurrencia.

### `restore_single_app` (Rust) repite `flatpak list` por cada app
`get_installed_app_info` (`backup.rs`, usada en `restore_single_app:901`) invoca `flatpak list --app --columns=...` completo **por cada app restaurada individualmente**, cuando `create_backup` ya demuestra el patrón correcto (`list_installed_apps_map`, `backup.rs:155-178`, construye el mapa una sola vez).
**Acción:** en `restore_backup`, construir el mapa una vez y pasarlo a `restore_single_app`.

---

## SQLite — escrituras secuenciales en loop

`src/utils/dbCache.ts` tiene varios puntos donde se hace `await` dentro de un `for...of`, un roundtrip IPC Tauri→Rust→SQLite por iteración:
- `cacheAppsOfTheWeek` (líneas 309-322)
- `cacheCategories` (líneas 354-359)
- `cachePermissionsBatch` (líneas 497-504) — irónicamente nombrada "batch" pero inserta de a uno
- `markPermissionsAsOutdatedBatch` (líneas 531-536) — llama `markPermissionsAsOutdated` que reabre `initialize()` y hace un `UPDATE` por app

El propio código ya demuestra el patrón correcto en **lecturas**: `getCachedPermissionsBatch:471` y `cleanOldPermissionsBatch:576` usan `IN (VALUES ...)`. Falta aplicar el mismo criterio a las escrituras.
**Acción:** transacciones explícitas (`BEGIN`/`COMMIT`) o `INSERT ... VALUES (...), (...), (...)` multi-fila.

---

## Antipatrones de React

### `key={uuidv4()}` en 7 listas de skeletons
`SearchResults.tsx:68`, `CategoryApps.tsx:92`, `Home.tsx:241`, `CategoriesSection.tsx:37`, `AppsOfTheDaySection.tsx:100`, `DeveloperProfile.tsx:230`, `AppDetails.tsx:1490`. Genera una key **nueva en cada render**, lo cual es peor que usar el índice: con índice React al menos reconcilia por posición; con `uuidv4()` nuevo cada vez, React desmonta y remonta cada nodo skeleton en cada re-render del padre mientras `isLoading` es true.
**Acción:** `key={\`skeleton-${i}\`}` con el índice del `Array.from(new Array(12))`.

### 3 hooks reimplementan el mismo patrón de cache manual
`useCategories.ts`, `useAppsOfTheWeek.ts`, `useAppOfTheDay.ts` repiten la misma estructura: `useState(cachedData)` + `useState(shouldFetch)` + `useState(isChecking)` + un `useEffect` que lee de `dbCacheManager` y decide `shouldUpdateSection` + un `useQuery` con `enabled: shouldFetch` que vuelve a escribir en `dbCacheManager` y en `cachedData` dentro del propio `queryFn` (mutar estado de React dentro de `queryFn` es en sí mismo un antipatrón de React Query — mezcla el ciclo de cache de la librería con estado externo).
**Acción:** extraer un hook genérico `useCachedSectionQuery<T>(sectionName, { get, set, fetcher, maxDaysOld })`; usar `select`/`initialData` de React Query en vez de `setCachedData` dentro de `queryFn`.

### Suscripción a store sin selector (impacto en re-renders)
Ver detalle en el informe de Eje 1 — `Home.tsx:59` y `AppDetails.tsx:71` se re-renderizan en cualquier cambio del store completo, cuando el resto del código ya usa selectores individuales correctamente.

### `catch` silencioso sin log
`AppDetails.tsx:402` — `await invoke("kill_pty_process", { appId: app.app_id }).catch(() => {});` dentro de un cleanup de `useEffect`. Aceptable no mostrar UI en un cleanup, pero el resto del archivo sí loguea (línea 156 usa `.catch(console.error)` para el mismo `invoke` en otro punto).
**Acción:** usar `.catch(console.error)` para consistencia y trazabilidad si el kill del proceso PTY falla.

### `useEffect` con dependencias suprimidas
`AppDetails.tsx:140,151,164` tienen `biome-ignore lint/correctness/useExhaustiveDependencies` justificados en comentario (evitar loops por funciones no memoizadas: `startRiskCountdown`, `clearCountdown`, setup de listeners PTY). No es un bug hoy, pero suprime el lint de forma permanente.
**Acción:** envolver esas funciones en `useCallback` con sus dependencias reales y quitar los `biome-ignore`.

### Componentes gigantes sin descomposición
`AppDetails.tsx` (1555 líneas) y `UpdateAllModal.tsx` (1233 líneas) concentran múltiples responsabilidades (UI, lógica de instalación, listeners PTY, countdown de riesgo, verificación de firmas) sin `React.memo` en subsecciones aislables.
**Acción:** extraer subcomponentes (`InstallProgressPanel`, `ScreenshotCarousel`, `RiskCountdownBanner`) memoizados.

---

## Rust — manejo de errores y duplicación

### Código huérfano que no compila
`src-tauri/src/licensing/licensing.rs` (733 líneas) — no está declarado en ningún `mod` de `lib.rs` (solo existen `mod backup; mod donations;`), y referencia crates no presentes en `Cargo.toml` (`base64`, `sha2`, `sysinfo`, `tracing`, `hex`) y un módulo `crate::hardware` inexistente. Todo el archivo no forma parte del binario compilado.
**Acción:** eliminar el directorio si no hay plan de reactivarlo, o completar dependencias/módulos faltantes antes de considerarlo parte del proyecto.

### Función muerta detectada por el compilador
`get_cached_image_info` (`lib.rs:733`) — `warning: function is never used`. Relacionado con el hallazgo de duplicación de hash de imagen del Eje 1: ya resuelve el problema de doble invoke IPC pero nadie la usa.

### Regex recompiladas en cada llamada
`extract_release_info` (`lib.rs:2988,3001,3014,3028`) compila 4 regex nuevas en cada invocación en vez de usar `once_cell::Lazy`, patrón que el mismo archivo ya aplica correctamente en líneas 16-30.
**Acción:** mover a `static ...: Lazy<regex::Regex>`.

### Mutex poisoning en cascada por `panic = "abort"`
~15 sitios de `.lock().unwrap()` sobre `Mutex<HashMap<...>>` compartido entre hilos de PTY (`lib.rs:297,309,772,1772,1827,2321,2364,2398,2428,2446`). Si cualquier hilo que sostiene el lock hace panic (por ejemplo dentro del hilo de monitoreo de terminación de proceso, `lib.rs:1822-1854`), el Mutex queda "poisoned" y **todos los `.lock().unwrap()` subsecuentes panickean en cascada** — con `panic = "abort"` esto mata el proceso completo. No es un bug activo detectado, pero es un patrón frágil dado el uso extensivo de `std::thread::spawn` para procesos PTY.
**Acción:** considerar `parking_lot::Mutex` (no envenenable) o manejar `Err(poisoned)` explícitamente con `.lock().unwrap_or_else(|e| e.into_inner())`.

### Race condition lógica (TOCTOU benigno) en `ProcessMap`
`start_flatpak_interactive` e `install_local_flatpak` lanzan 3 hilos independientes (stdout reader, stderr reader, monitor de terminación) que acceden concurrentemente al mismo `ProcessMap` con la misma key. Si `send_to_pty` se invoca justo cuando el hilo monitor está removiendo la entrada tras detectar terminación, hay una ventana de inconsistencia lógica — el `Mutex` previene corrupción de memoria, el resultado es simplemente un error `"No process found"` bien manejado (`lib.rs:2417`). Severidad baja, solo se documenta.

### Patrón `flatpak-spawn --host` duplicado 12+ veces
Ver detalle completo en el informe de Eje 1 — `backup.rs` ya resolvió esto con `run_flatpak_async`, `lib.rs` no lo reutiliza.

### Logging de debug en producción
Docenas de `println!`/`eprintln!` en rutas críticas (`lib.rs:1748,1754,1768...`, prácticamente todo `verify_app_hash` desde línea 2594 hasta 3624). No hay `tracing`/`log` crate en uso en este árbol (a diferencia del `licensing.rs` huérfano, que sí usa `tracing`). Esto escribe a stdout/stderr sin control de nivel y puede filtrar app_ids/URLs a logs del sistema (journald) si la app corre bajo systemd.
**Acción:** adoptar `log`/`tracing` con niveles, o gatear tras `#[cfg(debug_assertions)]`.

---

## Resumen de acciones de mayor impacto (orden sugerido)

1. Batchear `useAppsOfTheWeek.ts:66-77` (N+1 de red) y las escrituras secuenciales en `dbCache.ts` (N+1 de SQLite).
2. Corregir `key={uuidv4()}` en los 7 skeletons.
3. Extraer hook genérico `useCachedSectionQuery` para reemplazar la lógica duplicada en 3 hooks.
4. Factorizar `run_flatpak_async`-equivalente en `lib.rs`, eliminar `licensing.rs` huérfano o completarlo.
5. `once_cell::Lazy` en `extract_release_info`; revisar mutex poisoning en el mapa de procesos PTY.
6. Gatear/eliminar `println!` de debug en rutas de producción.
