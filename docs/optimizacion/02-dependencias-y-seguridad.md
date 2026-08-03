# Eje 2 — Dependencias externas y hardening de seguridad

Auditoría de `package.json`, `Cargo.toml` y el código que las usa.

---

## ✅ Seguridad — resuelto

### Command injection en 5 sitios de `lib.rs`
`src-tauri/src/lib.rs` construía comandos de shell completos como *string* y los pasaba a `sh -c "<string>"`, interpolando datos externos (`app_id`, `file_path` de un diálogo de selección de archivo) con `{:?}` — formato `Debug` de Rust, que **no es un escape shell-safe**. Un nombre de archivo con backticks, `$(...)`, `;` o `|` podía ejecutar comandos arbitrarios al inspeccionar/instalar un `.flatpak` local.

**Corregido:**
- `is_valid_app_id()` — regex reverse-DNS de Flatpak, aplicado como guard en `start_flatpak_interactive`, `get_install_dependencies`, y antes de usar `app_id` en el check de `already_installed` de `inspect_local_flatpak`.
- `stage_flatpak_bundle_safely()` — copia el `.flatpak` elegido por el usuario a un archivo temporal con nombre generado por la app (`klia-store-local-<hex>-<pid>.flatpak`) antes de interpolarlo en cualquier comando, así el nombre original nunca toca la shell. Aplicado en `inspect_local_flatpak` e `install_local_flatpak`, con limpieza del temporal al finalizar el proceso (todas las ramas de salida).
- El check `already_installed` pasó de `sh -c` con string interpolado a `Command::args()` directo, eliminando la shell de ese punto por completo.

`src-tauri/src/backup.rs` ya usaba el patrón correcto (`Command::new(...).args(&[...])`) y sirvió de referencia para el fix.

Verificado con `cargo check` y `cargo build --release` (build completo, sin errores).

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
| `serde_yaml` (Rust) | Parsing de manifests Flatpak | Mantener |

### Import de barrel de `@mui/icons-material` en 11 archivos
`TitleBar.tsx:7`, `CachedImage.tsx:1`, `DependencyStatusCard.tsx:1`, `ExtensionsPopover.tsx:5`, `InstalledAppCard.tsx:7`, `CategoryApps.tsx:1`, `Backups.tsx:9`, `DeveloperProfile.tsx:1`, `MyApps.tsx:1`, `SearchResults.tsx:1`, `AppDetails.tsx:9` usan `import { X } from "@mui/icons-material"` en vez del patrón por subpath (`import X from "@mui/icons-material/X"`) que ya usan los otros 45 imports del proyecto. El subpath garantiza tree-shaking independientemente del bundler; el barrel depende de que Vite/Rollup resuelva bien los side-effects del paquete.
**Acción:** normalizar los 11 archivos al patrón ya dominante en el resto del código.

---

## Resumen de prioridades

| # | Hallazgo | Estado |
|---|---|---|
| 1 | Command injection en 5 sitios de `lib.rs` | ✅ Resuelto |
| 2 | `react-qr-code`, `uuid`, `react-virtual` sin uso real | Pendiente |
| 3 | Import de barrel de MUI icons en 11 archivos | Pendiente |
