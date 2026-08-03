# Eje 1 — Peso final de la app y reuso de datos/objetos

Auditoría de `src/` y `src-tauri/` enfocada en: tamaño del bundle final, assets sin optimizar, duplicación de implementaciones, reuso de objetos/datos en vez de reconstruirlos, y zonas candidatas a cache.

---

## Peso muerto para eliminar (bajo esfuerzo, impacto inmediato)

### `react-qr-code` — dependencia completa sin un solo import
Solo se usa `qrcode.react` (`src/components/DonationModal.tsx:22`, `QRCodeSVG`). `react-qr-code` no aparece en ningún import de `src/`.
**Acción:** eliminar `react-qr-code` de `package.json`.

### `@tanstack/react-virtual` — instalada, cero usos en todo `src/`
`grep -rln "react-virtual" src` no arroja resultados. Listas como `src/pages/myApps/MyApps.tsx:557` o `src/pages/backups/Backups.tsx:573` renderizan todos los nodos sin virtualizar.
**Acción:** si las listas son pequeñas (decenas de ítems), eliminar la dependencia. Si se prevén catálogos grandes, aplicar `useVirtualizer` en `SearchResults.tsx:106` y `CategoryApps.tsx:151`, que son los candidatos reales.

### `src/hooks/useGitHubStars.ts` — 75 líneas de código muerto
No se importa desde ningún componente. Duplica lógica ya cubierta por `useRepoStats.ts` (que sí se usa y además soporta GitHub + GitLab + GitLab GNOME).
**Acción:** eliminar el archivo completo.

### Assets huérfanos sin ninguna referencia — 1.4MB+ sin usar
- `src/assets/internalPromo/banner.png` (836K) — sin referencias en `src/`.
- `src/assets/internalPromo/hentairos_logo.png` (564K) — sin referencias en `src/`.
- `src/assets/kliaLogo.png` (200K) — no se importa en ningún `.ts/.tsx`.

**Acción:** eliminar los tres, o confirmar si se cargan dinámicamente desde Rust/config (no ocurre en `src/`).

### `uuid` como dependencia
De 8 usos totales, 7 son solo `key={uuidv4()}` en skeletons de carga (`SearchResults.tsx:68`, `CategoryApps.tsx:92`, `Home.tsx:241`, `CategoriesSection.tsx:37`, `AppsOfTheDaySection.tsx:100`, `DeveloperProfile.tsx:230`, `AppDetails.tsx:1490`) — esto además es un antipatrón funcional (genera key nueva en cada render, ver informe de rendimiento). El único uso legítimo es `instanceId: uuidv4()` en `src/hooks/useInstalledApps.ts:50`.
**Acción:** sustituir por `crypto.randomUUID()` nativo (soportado en el WebView de Tauri) y eliminar la dependencia por completo.

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

| # | Acción | Esfuerzo | Impacto |
|---|---|---|---|
| 1 | Eliminar `react-qr-code`, `useGitHubStars.ts`, assets huérfanos (1.4MB+) | XS | Alto |
| 2 | Eliminar `uuid`, sustituir por `crypto.randomUUID()` | S | Medio |
| 3 | Decidir `@tanstack/react-virtual`: usar o eliminar | S | Medio |
| 4 | `useMemo` en `appStream`; selectores de Zustand en `Home.tsx`/`AppDetails.tsx` | S | Medio |
| 5 | Extraer función de hash de imagen (4 duplicados) + adoptar `get_cached_image_info` | S | Medio |
| 6 | Helper `run_flatpak_async`-equivalente en `lib.rs` (12+ duplicados) | M | Medio |
| 7 | `once_cell::Lazy` en regex de `extract_release_info` | XS | Bajo |
| 8 | `flatpak list` una sola vez en `restore_backup` | S | Bajo-Medio |
| 9 | Fuente a WOFF2 | XS | Bajo |
