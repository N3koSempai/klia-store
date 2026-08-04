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

### ✅ `appStream` reconstruido en cada render — resuelto
`src/pages/appDetails/AppDetails.tsx:55-63` reconstruía el objeto `appStream` en cada render antes de pasarlo a `useAppScreenshots(appStream)`.

**Corregido:** envuelto en `useMemo(() => ({...}), [app.app_id, app.name, app.summary, app.description, app.icon, app.screenshots, app.urls])`. Se verificó antes de aplicar que `useAppScreenshots` depende de `app.id`/`app.screenshots`/`app.urls` en su `useEffect`, no de la referencia completa del objeto — por lo que el cambio es una optimización pura (evita crear un objeto nuevo por render) y no altera cuándo se dispara el fetch de screenshots. Se revisó también, a pedido explícito, si esto podía interactuar con un bug reportado de "AppDetails no refleja instalación tras usar el atajo directo para abrir un `.flatpak`" — son independientes: ese bug era que `LocalFlatpakInstallModal` nunca notificaba al store tras instalar (ver más abajo), no relacionado con el render de `appStream`.

Verificado con `tsc --noEmit` sin errores.

### ✅ Suscripción a store completo sin selector — resuelto
- `src/pages/home/Home.tsx:58` y `src/pages/appDetails/AppDetails.tsx:70` desestructuraban del store completo (`const { x, y } = useInstalledAppsStore();`), lo que re-renderiza el componente en cualquier cambio de `installedApps`, `installedExtensions`, `installedRuntimes`, etc., sin importar si esa parte del estado se usa.

**Corregido:** ambos archivos ahora usan selectores individuales (`useInstalledAppsStore((state) => state.x)`), igual que el patrón ya presente en `MyApps.tsx:124-142`, `Backups.tsx:134-143`, `Analytics.tsx:39-49` y `ExtensionsPopover.tsx:60-63`. Verificado con `tsc --noEmit` sin errores.

### Funciones auxiliares recreadas en cada render
`src/pages/appDetails/AppDetails.tsx:303` (`stripHtml`) y `:326` (`stripAnsi`, con 4 regex literales dentro) están definidas en el cuerpo de un componente de 1555 líneas que actualiza estado frecuentemente durante instalación (`installOutput` se actualiza por cada línea de PTY).
**Acción:** mover ambas fuera del componente — son funciones puras sin dependencias de props/state.

---

## Rust — duplicación que infla el binario

### ✅ Lógica de hash+extensión de imagen repetida 4 veces — resuelto
El cálculo `xxh3_64` + determinación de extensión por sufijo de URL se repetía literalmente igual en `download_and_cache_image`, `get_cached_image_filename`, `check_cached_image_exists` y `get_cached_image_info`.

**Corregido:**
- Extraída `fn compute_cache_filename(cache_key: &str, image_url: &str) -> String` y `fn canonical_path_string(path: &Path) -> String` compartidas; las 4 funciones ahora la reusan.
- `get_cached_image_filename` y `check_cached_image_exists` eliminadas por completo (código muerto, cero invokes desde el frontend).
- `get_cached_image_info` ahora está registrada en `generate_handler!` (antes existía pero nadie la invocaba).
- `download_and_cache_image` cambió su contrato: antes devolvía solo el `filename` y el frontend hacía un segundo invoke (`get_cached_image_path`) para resolver el path completo; ahora devuelve directamente la ruta absoluta canónica. `src/utils/imageCache.ts::downloadImage` se actualizó para eliminar ese segundo invoke — cada imagen nueva descargada pasa de 2 idas y vueltas IPC a 1.

Verificado con `cargo check` (sin warnings) y `tsc --noEmit` (sin errores).

### ✅ Doble lectura completa del mismo archivo `.flatpak` — resuelto
`inspect_local_flatpak` llamaba `fs::read(&file_path)` **dos veces** sobre el mismo archivo (una para `metadata_block`, otra para `branch`). Para bundles grandes (cientos de MB) esto duplicaba I/O y memoria sin necesidad.

**Corregido:** se lee el archivo una sola vez en `bundle_text` y ambas extracciones (`metadata_block` y `branch`) reusan ese mismo texto decodificado. Verificado con `cargo check` sin warnings.

### ✅ Patrón `flatpak-spawn --host` repetido sin abstracción — resuelto (casos simples)
`lib.rs` repetía en varios comandos el mismo bloque:
```rust
let is_flatpak = std::env::var("FLATPAK_ID").is_ok();
let output = if is_flatpak { shell.command("flatpak-spawn").args(["--host","flatpak",...]) } else { shell.command("flatpak").args([...]) }
```
`src-tauri/src/backup.rs:19-62` ya había resuelto esto con `run_flatpak`/`run_flatpak_async`.

**Corregido:** se agregó el mismo helper `run_flatpak_async(app, args)` en `lib.rs` (junto a `is_running_in_flatpak`) y se aplicó a todos los comandos cuyo patrón era "ejecutar y esperar el `Output` completo" con `.args()` directo: `get_installed_flatpaks`, `get_available_updates`, `get_app_remote_metadata`, `get_installable_extensions` (loop de búsqueda) y `check_github_updates`.

**No se tocaron** los sitios que usan `.spawn()` con streaming de eventos en tiempo real (`update_flatpak`, `update_system_flatpaks`, `install_extension`, `uninstall_extension`, `uninstall_flatpak`) — devuelven `(rx, child)`, no `Output`, y el helper no cubre ese caso sin cambiar su forma. Tampoco se tocaron los sitios que ya usan `sh -c` con pipes (`get_install_dependencies`, instalación local, `start_flatpak_interactive`) — necesitan un shell real para el pipe/PTY, no aplican a `.args()` directo. Verificado con `cargo check` y `cargo clippy` sin warnings nuevos, y `cargo build --release` exitoso.

---

## Zonas candidatas a cache que hoy no existe

### ✅ Regex recompiladas en cada llamada — resuelto
`extract_release_info` compilaba 4 regex nuevas en cada invocación (se llama desde `verify_app_hash`, disparado por el frontend en cada verificación de hash), en vez de usar `once_cell::Lazy` como ya hacía el mismo archivo para casos análogos (GitHub/GitLab clone URL parsing).

**Corregido:** los 4 patrones (asset/archive de GitHub y GitLab) se movieron a `static ..._REGEX: Lazy<regex::Regex>`, junto a las regex existentes. `extract_release_info` ahora las reusa en vez de recompilar. Verificado con `cargo check` sin warnings.

### ✅ `flatpak list` repetido sin caché entre comandos relacionados — resuelto
`backup.rs` (`list_installed_apps_map`) ya evitaba repetir esto por app durante `create_backup`. Pero `get_installed_app_info` (usada en `restore_single_app`) volvía a invocar `flatpak list` completo **por cada app restaurada individualmente**.

**Corregido:** `restore_backup` ahora construye el mapa una sola vez con `list_installed_apps_map()` antes del loop de restauración y lo pasa por parámetro a `restore_single_app`, que lo consulta por `app_id` en vez de re-listar. `get_installed_app_info` quedó sin usos y se eliminó. Como cada `app_id` del backup solo se restaura una vez en el loop, el mapa tomado al inicio no queda desactualizado para ningún lookup posterior. Verificado con `cargo check` sin warnings.

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
| 4 | Selectores de Zustand en `Home.tsx`/`AppDetails.tsx` | S | Medio | ✅ Resuelto |
| 4b | `useMemo` en `appStream` (`AppDetails.tsx`) | S | Medio | ✅ Resuelto |
| 5 | Extraer función de hash de imagen (4 duplicados) + adoptar `get_cached_image_info` | S | Medio | ✅ Resuelto |
| 6 | Helper `run_flatpak_async`-equivalente en `lib.rs` | M | Medio | ✅ Resuelto (casos simples) |
| 7 | `once_cell::Lazy` en regex de `extract_release_info` | XS | Bajo | ✅ Resuelto |
| 8 | `flatpak list` una sola vez en `restore_backup` | S | Bajo-Medio | ✅ Resuelto |
| 9 | Doble lectura de `.flatpak` en `inspect_local_flatpak` | XS | Bajo | ✅ Resuelto |
| 10 | Fuente a WOFF2 | XS | Bajo | Pendiente (a pedido del usuario) |
