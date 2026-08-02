# Propuesta: Respaldo (Backup) y Restauración de Apps Flatpak

Estado: propuesta aprobada en discusión, pendiente de implementación.

## Objetivo

Permitir al usuario respaldar selectivamente las apps Flatpak instaladas, eligiendo
por app si se incluyen sus datos (`~/.var/app/<app-id>`) o no, y poder restaurarlas
después — incluso si la app ya no está disponible en Flathub o no hay red.

## Ubicación en la app

Sección dedicada de navegación **"Respaldos"** (nueva ruta, ítem de sidebar propio),
en lugar de un botón dentro de "Mis Apps" o una acción por card. Motivo: el respaldo
tiene estado propio (historial de backups hechos, ubicación en disco, restauración)
que crecería mal colgado de un modal en `MyApps.tsx`. Una página propia da desde el
inicio el lugar natural para listar backups existentes y lanzar restauraciones, sin
tener que migrar la UX más adelante.

## Por qué no basta con copiar `~/.var/app/<id>` de vuelta

`~/.var/app/<app-id>` solo contiene datos/config/cache de la app — **no** el binario
ni sus dependencias. El ejecutable real vive gestionado por OSTree en
`/var/lib/flatpak/app/<id>/...` y requiere que Flatpak tenga la app *registrada*
(refs, deployment, permisos de sandboxing) para poder ejecutarla. No existe una
"carpeta portable de la app" que se pueda simplemente copiar; siempre hace falta
un paso de instalación gestionado por Flatpak para tener algo ejecutable.

## Por qué no confiar en que Flathub retenga versiones viejas

Flathub es un repo OSTree: cada actualización crea un commit nuevo en la rama
`stable`, pero los commits viejos son podados sin garantía de retención documentada.
Es técnicamente posible pedir `flatpak install --commit=<hash>` para fijar una
versión exacta, pero si Flathub ya podó ese commit, la instalación falla. Esta vía
queda como **fallback opcional** (ver más abajo), no como mecanismo principal.

## Diseño principal: bundle local vía `flatpak build-bundle`

En vez de depender de un tercero (Flathub) para recuperar una versión exacta,
cada backup **congela la app tal como está instalada localmente** en el momento
del respaldo, usando `flatpak build-bundle` sobre el repo OSTree local del usuario.
Esto la hace autocontenida y no depende de red ni de qué tan generoso sea Flathub
reteniendo commits viejos.

### Contenido de cada backup de app

1. **`<app-id>.flatpak`** — bundle exportado vía `build-bundle` (la app exacta,
   versión congelada, generado desde el repo OSTree local).
2. **`manifest.json`** — metadata: `app_id`, nombre, versión, ref del runtime exacto
   (id + arquitectura + rama + commit), permisos (`flatpak override`, ver abajo),
   fecha del respaldo.
3. **`data.tar.zst`** *(opcional, según selección del usuario)* — contenido de
   `~/.var/app/<app-id>` comprimido con zstd.
4. **Runtime del bundle** *(opcional, seleccionable por el usuario, ver sección de
   deduplicación)* — bundle del runtime exportado con `build-bundle --runtime`,
   para permitir restauración 100% offline.

### Permisos (`flatpak override`)

Los permisos otorgados a una app (`flatpak override`) **no viven** dentro de
`~/.var/app/<app-id>` — viven en `~/.local/share/flatpak/overrides/<id>` (o el
equivalente de sistema). Un backup ingenuo que solo copie `~/.var/app` los pierde.
El `manifest.json` debe capturarlos explícitamente para poder reaplicarlos con
`flatpak override` al restaurar.

## Selección de formato de compresión

`tar` + `zstd` (`.tar.zst`) para los datos de usuario. Comprime casi tan bien como
xz pero mucho más rápido — relevante para carpetas de datos grandes (juegos, IDEs).
Es además el códec que ya usa Flatpak/OSTree internamente, y el que usa Warehouse
(la referencia principal del ecosistema) en producción para su feature de
snapshots. Se implementa con las crates nativas `tar` y `zstd` en Rust (sin
depender de binarios externos del sistema).

## Runtime: opción seleccionable + deduplicación entre backups

Incluir el runtime en el bundle es **opcional y seleccionable por el usuario**,
igual que la opción "con datos" — no todos los backups necesitan ser 100% offline,
y el runtime puede pesar mucho más que la app misma.

Problema a evitar: si el usuario respalda 5 apps que comparten `org.gnome.Platform//43`,
no tiene sentido exportar el mismo runtime 5 veces.

### Solución: biblioteca compartida de runtimes por carpeta de destino

- La carpeta de destino de backups tiene una subcarpeta compartida `runtimes/`
  (no por-app).
- Antes de exportar un runtime para una app, se comprueba si ya existe
  `runtimes/<runtime-id>-<version>-<arch>.flatpak` en esa carpeta. Si existe, no
  se vuelve a exportar: el `manifest.json` de la app simplemente referencia ese
  archivo compartido por nombre.
- Si no existe, se exporta una vez (`build-bundle --runtime`) y queda disponible
  para que cualquier otro backup futuro en la misma carpeta lo reutilice.
- El `manifest.json` de cada app guarda el ref del runtime y un puntero relativo
  a `../runtimes/<archivo>.flatpak` (no una copia).

### Resolución al restaurar

1. Si el runtime exacto ya está instalado en el sistema destino → se usa ese, se
   ignora cualquier bundle.
2. Si no está instalado pero el bundle existe en `runtimes/` (ya sea de esta carpeta
   de backups o el usuario lo tiene junto al backup) → se instala desde ahí, sin red.
3. Si no está instalado y no hay bundle disponible → se intenta traer desde Flathub
   por red como último recurso, y se avisa claramente al usuario si eso falla.

## Plan B (descartado como mecanismo principal, mantenido como fallback informativo)

Guardar el commit hash de Flathub en el manifiesto e intentar
`flatpak install --commit=<hash> flathub <app-id>` como alternativa si por algún
motivo no se dispone del bundle local (p. ej. el usuario perdió el archivo del
bundle pero conserva el manifiesto). Si el commit fue podado, se debe avisar
explícitamente al usuario y ofrecer instalar la última versión disponible —
nunca fallar en silencio ni sustituir la versión sin decirlo.

## Validación contra el estado del arte (Warehouse)

Investigación de la app GNOME **Warehouse** (`io.github.flattool.Warehouse`,
referencia principal del ecosistema para este problema):

- Su feature "Snapshots" **solo** respalda `~/.var/app/<app-id>` (datos), asumiendo
  que la app siempre se puede reinstalar después desde Flathub. Nunca empaqueta el
  binario ni el runtime.
- Usa `tar` (shell-out al binario del sistema) con zstd para el archivo de datos,
  más un JSON sidecar con metadata — confirma la elección de zstd como estándar de
  facto.
- No resuelve el caso "la app ya no está en Flathub" ni "quiero restaurar sin red" —
  hueco real que nuestro diseño con `build-bundle` sí cubre.
- Conclusión: nuestro diseño es más completo que el estado del arte existente para
  el caso de backup verdaderamente offline/a-prueba-de-desaparición-en-Flathub, a
  costa de bundles más pesados que un simple tarball de datos.

## Gotchas técnicos a respetar en la implementación

- `build-bundle` exporta un solo ref por invocación (la app **o** el runtime, no
  ambos) — hace falta una invocación separada por cada uno.
- GPG signing es opcional en `build-bundle`/`install`; no hace falta montar
  infraestructura de firmas para que los bundles se instalen localmente.
- Sin bundle de runtime y sin runtime ya instalado en destino, la instalación
  offline de un bundle de app falla con "runtime not found" — de ahí la
  importancia de registrar el ref exacto del runtime en el manifiesto incluso
  cuando no se incluya el bundle del runtime.
