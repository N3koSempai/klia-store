# Eje 1 — Peso final de la app y reuso de datos/objetos

Auditoría de `src/` y `src-tauri/` enfocada en: tamaño del bundle final, assets sin optimizar, duplicación de implementaciones, reuso de objetos/datos en vez de reconstruirlos, y zonas candidatas a cache.

---

## ✅ Peso muerto — resuelto

### `react-qr-code` — dependencia completa sin un solo import
Eliminada de `package.json`. Se mantiene `qrcode.react`, único usado (`DonationModal.tsx`).

### `@tanstack/react-virtual` — instalada, cero usos en todo `src/`
Evaluado y descartado deliberadamente: ya hubo un intento previo de usar esta librería en el proyecto y no funcionó bien para el caso real — se optó por una solución propia. Esa solución ya existe y cubre el problema de fondo (evitar cargar/renderizar de más en listas grandes): `CachedImage.tsx` usa `IntersectionObserver` para no disparar la carga de imágenes fuera de viewport, que es el costo real en listas de apps con miniaturas. Virtualizar el DOM completo encima de eso no aportaba valor adicional.
**Acción:** dependencia eliminada de `package.json`.

### `src/hooks/useGitHubStars.ts` — 75 líneas de código muerto
Eliminado. Duplicaba lógica ya cubierta por `useRepoStats.ts`.

### Assets huérfanos sin ninguna referencia — 1.4MB+ sin usar
Eliminados: `src/assets/internalPromo/banner.png` (836K), `src/assets/internalPromo/hentairos_logo.png` (564K), `src/assets/kliaLogo.png` (200K).

### `uuid` como dependencia
Eliminada. El único uso legítimo (`instanceId` en `useInstalledApps.ts`) pasó a `crypto.randomUUID()` nativo. Los 7 usos de `key={uuidv4()}` en skeletons de carga se corrigieron:
- 6 casos (listas de skeleton de longitud fija, sin reordenamiento ni estado por ítem) → `key={\`skeleton-${index}\`}`.
- 1 caso real de datos (indicadores de paginación de screenshots en `AppDetails.tsx`) → reusa el array `screenshotIds`, ya memoizado con `crypto.randomUUID()` por screenshot, en vez de un índice suelto o una key regenerada en cada render.

Verificado con `tsc --noEmit` y `npm run build` — build limpio. `npm audit` bajó de 7 a 6 vulnerabilidades (todas transitivas de devDependencies, preexistentes y no relacionadas a este cambio).

---

## Reuso de objetos y datos (evitar reconstrucción innecesaria)

### `appStream` reconstruido en cada render
`src/pages/appDetails/AppDetails.tsx:56-64`:
```ts
const appStream: AppStream = { id: app.app_id, name: app.name, ... };
```
Se pasa a `useAppScreenshots(appStream)` (línea 70). El objeto se reconstruye sin necesidad en cada render del componente.
**Acción:** envolver en `useMemo(() => ({...}), [app.app_id, app.name, app.summary, app.description, app.icon, app.screenshots, app.urls])`.

### Suscripción a store completo sin selector
- `src/pages/home/Home.tsx:59`: `const { getUpdateCount } = useInstalledAppsStore();` — sin selector, re-renderiza la página raíz en cualquier cambio de `installedApps`, `installedExtensions`, `installedRuntimes`, etc.
- `src/pages/appDetails/AppDetails.tsx:71`: mismo problema, en una página de 1555 líneas con muchos estados locales.

Contraste correcto ya presente en el código: `MyApps.tsx:124-142`, `Backups.tsx:134-143`, `Analytics.tsx:39-49`, `ExtensionsPopover.tsx:60-63` sí usan selectores individuales (`useInstalledAppsStore((state) => state.x)`).
**Acción:** replicar ese mismo patrón en `Home.tsx` y `AppDetails.tsx`.

### Funciones auxiliares recreadas en cada render
`src/pages/appDetails/AppDetails.tsx:303` (`stripHtml`) y `:326` (`stripAnsi`, con 4 regex literales dentro) están definidas en el cuerpo de un componente de 1555 líneas que actualiza estado frecuentemente durante instalación (`installOutput` se actualiza por cada línea de PTY).
**Acción:** mover ambas fuera del componente — son funciones puras sin dependencias de props/state.

---

## Rust — duplicación que infla el binario

### Lógica de hash+extensión de imagen repetida 4 veces
El cálculo `xxh3_64` + determinación de extensión por sufijo de URL se repite **literalmente igual** en `src-tauri/src/lib.rs`:
- `download_and_cache_image` (líneas 596-604)
- `get_cached_image_filename` (líneas 658-679)
- `check_cached_image_exists` (líneas 695-721)
- `get_cached_image_info` (líneas 746-772)

Además, `get_cached_image_info` ya combina "exists + path" en una sola función — pero el compilador la marca `never used`. El frontend sigue haciendo **2 invokes IPC** (`check_cached_image_exists` + `get_cached_image_path`) en vez de uno solo.
**Acción:** extraer `fn compute_cache_filename(cache_key: &str, image_url: &str) -> String` y reusarla en los 4 sitios; migrar el frontend a `get_cached_image_info` y eliminar los comandos redundantes.

### Doble lectura completa del mismo archivo `.flatpak`
`src-tauri/src/lib.rs:2102` y `:2133` — `inspect_local_flatpak` llama `fs::read(&file_path)` **dos veces** sobre el mismo archivo (una para `metadata_block`, otra para `branch`). Para bundles grandes (cientos de MB) esto duplica I/O y memoria sin necesidad.
**Acción:** leer una sola vez y reusar los bytes para ambas extracciones.

### Patrón `flatpak-spawn --host` repetido 12+ veces sin abstracción
`lib.rs` repite en cada comando (`get_installed_flatpaks`, `get_install_dependencies`, `get_available_updates`, `update_flatpak`, `update_system_flatpaks`, `launch_flatpak`, `uninstall_flatpak`, `get_app_remote_metadata`, `get_installable_extensions`, `install_extension`, `uninstall_extension`, `check_github_updates`) el mismo bloque:
```rust
let is_flatpak = std::env::var("FLATPAK_ID").is_ok();
let output = if is_flatpak { shell.command("flatpak-spawn").args(["--host","flatpak",...]) } else { shell.command("flatpak").args([...]) }
```
`src-tauri/src/backup.rs:19-62` **ya resolvió esto** con `run_flatpak`/`run_flatpak_async`, bien factorizado y documentado.
**Acción:** extraer un helper equivalente y reusarlo en `lib.rs`, eliminando ~10 líneas duplicadas por comando.

---

## Zonas candidatas a cache que hoy no existe

### Regex recompiladas en cada llamada
`extract_release_info` (`lib.rs:2988,3001,3014,3028`) compila 4 regex nuevas en cada invocación (se llama desde `verify_app_hash`, disparado por el frontend en cada verificación de hash), en vez de usar `once_cell::Lazy` como ya hace el mismo archivo en líneas 16-30 para casos análogos.
**Acción:** mover los 4 patrones a `static ...: Lazy<regex::Regex>`.

### `flatpak list` repetido sin caché entre comandos relacionados
`backup.rs:155-178` (`list_installed_apps_map`) ya evita repetir esto por app durante `create_backup`. Pero `get_installed_app_info` (usada en `restore_single_app`, línea 901) vuelve a invocar `flatpak list` completo **por cada app restaurada individualmente**.
**Acción:** en `restore_backup`, construir el mapa una vez (como en `create_backup`) y pasarlo a `restore_single_app`.

---

## Assets — formato y compresión

### Fuente variable en TTF en vez de WOFF2
`src/theme/theme.ts:4,84` — `IBMPlexSans-VariableFont` (532K) en formato `truetype-variations`. WOFF2 comprime variable fonts 30-50% mejor y tiene el mismo soporte en WebView2/WebKitGTK.
**Acción:** convertir con `fonttools`/`woff2_compress` y actualizar el `@font-face`.

### Sin code-splitting explícito para three.js/drei
`vite.config.ts` no define `build.rollupOptions.output.manualChunks`. La ruta `/analytics` ya usa `lazy()`+`Suspense` (`src/routes/_layout/analytics.tsx:6-9`), lo cual ya excluye three.js del chunk inicial — esto está bien resuelto. Severidad baja: solo vale la pena si un análisis de bundle real (`rollup-plugin-visualizer`, no instalado) muestra fuga de three.js a otros chunks.

### Sin analizador de bundle en el proyecto
No hay `rollup-plugin-visualizer` ni `vite-plugin-compression`/`vite-plugin-imagemin`. Dado que Tauri sirve los assets localmente desde el binario (no por red), la compresión gzip/brotli es de bajo impacto; el visualizer sí ayuda a detectar regresiones de peso en CI.
**Acción:** agregar `rollup-plugin-visualizer` como devDependency para auditoría, no bloqueante.

---

## Resumen de acciones priorizadas

| # | Acción | Esfuerzo | Impacto | Estado |
|---|---|---|---|---|
| 1 | Eliminar `react-qr-code`, `useGitHubStars.ts`, assets huérfanos (1.4MB+) | XS | Alto | ✅ Resuelto |
| 2 | Eliminar `uuid`, sustituir por `crypto.randomUUID()` | S | Medio | ✅ Resuelto |
| 3 | Decidir `@tanstack/react-virtual`: usar o eliminar | S | Medio | ✅ Resuelto (eliminada) |
| 4 | `useMemo` en `appStream`; selectores de Zustand en `Home.tsx`/`AppDetails.tsx` | S | Medio | Pendiente |
| 5 | Extraer función de hash de imagen (4 duplicados) + adoptar `get_cached_image_info` | S | Medio | Pendiente |
| 6 | Helper `run_flatpak_async`-equivalente en `lib.rs` (12+ duplicados) | M | Medio | Pendiente |
| 7 | `once_cell::Lazy` en regex de `extract_release_info` | XS | Bajo | Pendiente |
| 8 | `flatpak list` una sola vez en `restore_backup` | S | Bajo-Medio | Pendiente |
| 9 | Fuente a WOFF2 | XS | Bajo | Pendiente |
