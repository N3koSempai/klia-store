# Eje 2 — Dependencias externas y hardening de seguridad

Auditoría de `package.json`, `Cargo.toml`, `tauri.conf.json`, `capabilities/default.json` y el código que las usa. Prioriza seguridad porque esta app ejecuta comandos del sistema (`flatpak`) y accede al filesystem del usuario.

---

## 🔴 Seguridad — severidad alta

### 1. Command injection real en 5 sitios de `lib.rs`
`src-tauri/src/lib.rs` construye comandos de shell completos como *string* y los pasa a `sh -c "<string>"`, interpolando datos externos:

- **`install_local_flatpak` (líneas 2294-2304)** — el caso más grave. `file_path` viene de un diálogo de selección de archivo (nombre no controlado por la app) y se interpola con `{:?}`:
  ```rust
  format!("LANG=C script -q /dev/null -c \"flatpak install -y --user {:?}\"", file_path)
  ```
  El formato `Debug` de Rust **no es un escape shell-safe** — solo escapa comillas y backslashes al estilo Rust, no las reglas de `sh`. Un nombre de archivo con backticks, `$(...)`, `;` o `|` ejecuta comandos arbitrarios. Vector práctico: abrir un `.flatpak` con nombre malicioso desde un USB compartido o una asociación de MIME manipulada.
- **`build_flatpak_interactive_cmd` (líneas 79-89)**, usada en `start_flatpak_interactive` (línea 1756-1757) — mismo patrón con `app_id`.
- **`build_flatpak_dependency_check_cmd` (líneas 92-105)**, usada en `get_install_dependencies` (línea 975-982) — mismo patrón.
- **`inspect_local_flatpak` (líneas 2079-2096)** — mismo patrón con `{:?}` sobre `file_path`.
- **Línea 2245-2251** — mismo patrón con `app_id`.

`src-tauri/src/backup.rs` **no tiene este problema**: usa `Command::new(...).args(&[...])` con argumentos separados consistentemente en todo el archivo. Es el patrón correcto ya validado en el propio proyecto.

**Acción:** eliminar `sh -c "<string interpolado>"` en los 5 sitios. Usar `Command::new("flatpak")`/`"flatpak-spawn"` con `.args([...])`, igual que `get_app_permissions` (`lib.rs:149-158`) y todo `backup.rs`. Si se necesita el envoltorio `script -q /dev/null -c` (pseudo-TTY), validar `app_id`/`file_path` contra un regex estricto **antes** de interpolar — nunca confiar en `{:?}` como escape de shell.

### 2. `assetProtocol.scope.allow` expone todo `$HOME`
`src-tauri/tauri.conf.json:29` — `"allow": ["$APPDATA/**", "$HOME/**"]`. El protocolo `asset://` puede servir cualquier archivo del home del usuario al webview, no solo `cacheImages`. Combinado con cualquier XSS/contenido no confiable renderizado, es una vía de exfiltración total del filesystem.
**Acción:** restringir a `$APPDATA/cacheImages/**` (o el subdirectorio real necesario), eliminar `$HOME/**`.

### 3. `shell:allow-execute` sin allowlist de comandos
`src-tauri/capabilities/default.json:19` — declarado sin `scope` que restrinja binario/args ("Enables the execute command without any pre-configured scope", según el schema generado). El código actual sí usa argumentos separados correctamente, pero el permiso tal cual habilitado permitiría en teoría ejecutar cualquier comando si algún punto futuro del código lo permite, sin ninguna restricción declarativa de por medio.
**Acción:** definir `scope` explícito limitando a los binarios `flatpak`, `flatpak-spawn`, `sh` (y args predefinidos donde sea posible).

### 4. CSP deshabilitada agrava los dos puntos anteriores
`src-tauri/tauri.conf.json:25` — `"csp": null`. Sin CSP, cualquier contenido inyectado en el webview (ej. un `summary`/`name` de paquete Flathub malicioso renderizado sin escapar) puede ejecutar JS arbitrario con acceso completo al puente `invoke()` y a `asset://$HOME/**`. Es la combinación (CSP null + asset scope amplio + shell sin scope) la que convierte un XSS de frontend en RCE/exfiltración de datos.
**Acción:** definir una CSP mínima (`default-src 'self'; img-src 'self' asset: https://flathub.org data:`, etc.).

### 5. Sin validación de formato de `app_id`/`extension_id`
No existe una función de validación (ej. `^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*)+$`, formato reverse-DNS de Flatpak) antes de:
- Pasarlo a los comandos shell interpolados (hallazgo 1).
- Construir rutas: `backup.rs:585` y `:963` — `home_dir()?.join(".var/app").join(app_id)`. Si `app_id` contuviera `../../etc` o un path absoluto, `PathBuf::join` puede escapar del directorio esperado (path traversal). `create_backup`/`restore_backup` reciben `app_id` **directamente del frontend** (`BackupAppRequest.app_id`, `backup.rs:116`) sin validarlo contra el resultado real de `flatpak list`.
**Acción:** función `is_valid_app_id()` compartida, validar en el borde de cada comando Tauri que reciba `app_id`/`extension_id`.

---

## 🟡 Seguridad — severidad media

### 6. Comandos que leen/escriben archivos arbitrarios sin pasar por el scope de Tauri
- `check_file_exists` (`lib.rs:651-654`) recibe cualquier `path: String` del frontend sin restricción — permite enumeración de filesystem (oráculo de existencia de archivos).
- `inspect_local_flatpak`/`install_local_flatpak` reciben `file_path` arbitrario sin validar que esté dentro de un directorio esperado ni que tenga extensión `.flatpak`.
- `download_flatpak_release` (`lib.rs:1896-1971`) escribe en `temp_dir()` con un `filename` derivado de la URL del asset de GitHub sin sanitizar — un release malicioso con nombre `../../.bashrc` podría escribir fuera de `temp_dir`.
**Acción:** sanitizar `filename` con `Path::new(filename).file_name()` antes de `temp_dir().join(filename)`.

### 7. El scope de `http:default` da una falsa sensación de restricción
`capabilities/default.json:26-31` limita `http:default` a `flathub.org`, pero eso **solo aplica a `fetch()` interceptado en el frontend**. El backend Rust hace peticiones libres con `reqwest` (a través de `tauri_plugin_http::reqwest::Client`) a GitHub API, GitLab arbitrario (dominio validado solo por regex, ver punto 8), 3 RPCs de Ethereum, y 2 APIs de Bitcoin (Blockstream/Mempool) — nada de esto pasa por el scope declarado.
**Acción:** documentar esto claramente; considerar un allowlist de dominios explícito a nivel de código Rust dado el número de endpoints externos.

### 8. Regex de dominio GitLab acepta cualquier host `gitlab.*`
`GITLAB_HTTPS_REGEX` (`lib.rs:22-26`) y las funciones que la usan hacen peticiones HTTP a cualquier dominio que empiece con `gitlab.` según lo que diga el manifest de Flathub. Riesgo bajo en la práctica (el manifest viene de Flathub), pero es una superficie de red no acotada por el scope de Tauri (ver punto 7).

### 9. `unwrap()`/`expect()` sobre datos externos con `panic = "abort"` en release
`Cargo.toml:40` tiene `panic = "abort"` — **cualquier panic mata el proceso completo**, no solo el hilo. El caso más grave: `licensing.rs:131` — `DateTime::from_timestamp(expiration_timestamp, 0).unwrap()`, donde `expiration_timestamp` viene de decodificar un `license_key` controlado externamente. Si el timestamp está fuera de rango, esto panickea. (Este archivo no compila actualmente — ver eje 3 — pero es un riesgo real si se reactiva sin corregir).
**Acción:** reemplazar por manejo de error explícito en todos los puntos donde el input no está 100% controlado por el propio proceso.

---

## 🔵 Seguridad — severidad baja / notas

- **`serde_yaml` 0.9 está deprecado** por su autor original (sin más parches de seguridad). Único uso: parsear manifests de Flatpak, que vienen de Flathub (fuente controlada) — riesgo bajo hoy, pero vale planear migración a `serde_yml`/`yaml-rust2` a mediano plazo.
- **Direcciones de wallet hardcodeadas** en `licensing.rs:528-529` — información pública de cobro, no un secreto. Se descarta explícitamente como hallazgo.
- **No se encontraron credenciales/tokens hardcodeados** en el resto del código.

---

## Dependencias — evaluación de reemplazo por código propio

| Dependencia | Uso real detectado | Veredicto |
|---|---|---|
| `react-qr-code` | Ninguno — duplicado muerto de `qrcode.react` | **Eliminar** |
| `uuid` | 7/8 usos son solo `key={uuidv4()}` en skeletons | **Eliminar**, usar `crypto.randomUUID()` nativo |
| `@tanstack/react-virtual` | Cero usos en `src/` | Usar donde corresponda o **eliminar** |
| `qrcode.react` | Único uso puntual en `DonationModal.tsx` | Mantener — problema de dominio real (generación QR) |
| `xxhash-rust`, `zstd`, `tar` (Rust) | Hashing/compresión real en `backup.rs`, multi-GB | Mantener — implementarlo a mano sería un error de ingeniería |
| `tokio` (features `rt`,`macros`, sin `full`) | `spawn_blocking` para paralelizar llamadas a `flatpak` en `backup.rs` | Mantener, bien acotado |
| `regex`, `chrono`, `once_cell` (Rust) | Justificados y usados correctamente (parcialmente, ver eje 1 sobre dónde falta aplicar `once_cell`) | Mantener |
| `serde_yaml` (Rust) | Parsing de manifests Flatpak | Mantener por ahora, evaluar migración por mantenimiento |

### Import de barrel de `@mui/icons-material` en 11 archivos
`TitleBar.tsx:7`, `CachedImage.tsx:1`, `DependencyStatusCard.tsx:1`, `ExtensionsPopover.tsx:5`, `InstalledAppCard.tsx:7`, `CategoryApps.tsx:1`, `Backups.tsx:9`, `DeveloperProfile.tsx:1`, `MyApps.tsx:1`, `SearchResults.tsx:1`, `AppDetails.tsx:9` usan `import { X } from "@mui/icons-material"` en vez del patrón por subpath (`import X from "@mui/icons-material/X"`) que ya usan los otros 45 imports del proyecto. El subpath garantiza tree-shaking independientemente del bundler; el barrel depende de que Vite/Rollup resuelva bien los side-effects del paquete.
**Acción:** normalizar los 11 archivos al patrón ya dominante en el resto del código.

---

## Resumen de prioridades

| # | Hallazgo | Severidad |
|---|---|---|
| 1 | Command injection en 5 sitios de `lib.rs` (`{:?}` no es escape de shell) | Alta |
| 2 | `assetProtocol` scope `$HOME/**` | Alta |
| 3 | `shell:allow-execute` sin scope/allowlist | Alta |
| 4 | CSP `null` (agrava 2 y 3) | Alta |
| 5 | Sin validación de formato de `app_id` | Alta |
| 6 | `fs`/paths sin sanitizar en comandos de archivo local | Media |
| 7 | Scope de `http:default` ilusorio (reqwest en Rust lo bypasea) | Media |
| 8 | Regex de dominio GitLab permisiva | Media |
| 9 | `unwrap()` sobre datos externos con `panic=abort` | Media |
| — | `serde_yaml` deprecado (nota de gestión) | Baja |
| — | Import de barrel de MUI icons en 11 archivos | Baja-Media |
| — | `react-qr-code`, `uuid`, `react-virtual` sin uso real | Media |

**Orden de trabajo sugerido:** primero los 5 hallazgos de seguridad alta (arreglables en una sola pasada de `capabilities/default.json` + `tauri.conf.json` + reemplazo de los 5 `sh -c` interpolados por `Command::args()`), luego las dependencias muertas (esfuerzo mínimo, impacto inmediato).
