# Propuesta: instalación de archivos .deb locales con análisis previo

Estado: **implementado** (vista híbrida: resumen abstracto + expansión al crudo).

Archivos:
- `src-tauri/src/local_deb.rs` — `inspect_local_deb` / `install_local_deb`, parsers y tests.
- `src/components/LocalDebInstallModal.tsx` — modal de revisión.
- `src/routes/_layout.tsx` — escucha `open-local-deb`.
- `src-tauri/src/lib.rs` — registro de comandos y detección de `.deb` en `argv[1]`.
- `io.github.N3kosempai.klia-store.desktop` — MimeType del paquete Debian.

## Objetivo

Permitir instalar archivos `.deb` locales (igual que hoy se instala un
`.flatpak` local) mostrando antes al usuario un análisis: metadatos, tamaño real
en disco, dependencias y qué se resolverá desde los repos, qué archivos y rutas
sensibles va a escribir, qué scripts de mantenedor ejecutará como root, binarios
setuid/setgid, y si el paquete se corresponde con algo de un repositorio
configurado o es de origen desconocido.

## Qué ya existe en el repo (puntos de integración)

- `src-tauri/src/debs.rs` — ya hay capa deb: `get_installed_debs` (solo
  lectura), `cache_deb_icon`, `uninstall_deb_package` (patrón `pkexec apt-get
  remove` por `flatpak-spawn --host`) y el validador
  `is_valid_deb_package_name`.
- `src-tauri/src/lib.rs:1592` `inspect_local_flatpak` y `:1821`
  `install_local_flatpak` — el patrón exacto a espejar: fase de inspección
  (comando read-only, `shell_quote` del path) + fase de instalación con
  `ProcessMap`, eventos `pty-output`/`pty-error`/`pty-terminated`.
- `src-tauri/src/lib.rs:2026` — al arrancar, si `argv[1]` termina en
  `.flatpak`/`.flatpakref` se emite `open-local-flatpak`. Aquí se añadiría
  `.deb` → `open-local-deb`.
- `src/components/LocalFlatpakInstallModal.tsx` — el modal de revisión
  (loading → review → installing → done/error) con `classifyPermissions()` y
  `riskScore()`; es el molde visual y de flujo.
- `io.github.N3kosempai.klia-store.desktop` — `MimeType=application/vnd.flatpak;…`;
  se añadiría `application/vnd.debian.binary-package` y `application/x-deb` para
  el doble clic desde el gestor de archivos.
- `src/pages/myApps/components/SourceToggle.tsx` ya tiene la fuente `deb`; tras
  instalar hay que llamar a `refreshInstalledPackages()` como hace el flujo
  flatpak.

## Diferencia conceptual clave respecto a Flatpak

Una app Flatpak está enjaulada: sus "permisos" son su superficie de ataque y se
pueden enumerar desde el bundle (`shared`, `sockets`, `filesystems`, buses). Un
`.deb` **no tiene sandbox**: corre como usuario normal con acceso total al home
y, en sus scripts de instalación, como **root**. Por eso el "análisis de
permisos" aquí no es "qué podrá hacer" sino:

1. qué va a **ejecutar como root** (scripts de mantenedor y triggers), y
2. qué va a **instalar en el sistema** (binarios setuid, servicios, rutas de
   persistencia / hooks).

Eso es lo que hay que presentar, no un sandbox.

## Qué es posible técnicamente (verificado en esta máquina)

Formato: un `.deb` es un archivo `ar` con `debian-binary`, `control.tar.*`,
`data.tar.*` y, opcionalmente, miembros de firma `_gpgorigin`/`_gpgmaint`/
`_gpgarchive` (debsigs).

Herramientas read-only, **sin root** (nivel L0–L3):

- `dpkg-deb -I file.deb`        → resumen + control (incluye tamaños de cada
                                   miembro y lista de scripts presentes).
- `dpkg-deb -f file.deb <campos…>` → campos sueltos del control: `Package`,
                                   `Version`, `Architecture`, `Installed-Size`,
                                   `Depends`, `Pre-Depends`, `Recommends`,
                                   `Suggests`, `Conflicts`, `Breaks`, `Replaces`,
                                   `Provides`, `Section`, `Priority`,
                                   `Essential`, `Multi-Arch`, `Source`, `Homepage`.
- `dpkg-deb -c file.deb`        → listado tipo `tar -v` del data: modo, dueño,
                                   tamaño y ruta de cada archivo (aquí se ven los
                                   setuid: `-rwsr-xr-x`, `-rwSr…`).
- `dpkg-deb --ctrl-tarfile file.deb | tar -tf -` → miembros del control; los
                                   scripts (`preinst`, `postinst`, `prerm`,
                                   `postrm`, `config`, `triggers`) se leen y
                                   auditan sin extraer nada a disco.
- `dpkg-deb -e file.deb <dir>`  → extrae el control a un dir, si se prefiere
                                   inspeccionar ficheros.
- `dpkg-deb -x file.deb <dir>`  → extrae el data a un dir (opción "inspeccionar
                                   sin instalar").
- `ar t file.deb`               → ver si hay miembro de firma `_gpgorigin`.
- `sha256sum file.deb`          → huella del archivo.

Simulación de dependencias, **sin root** (nivel L3):

- `LANG=C apt-get -s install /ruta/file.deb` → resuelve `Depends`/`Pre-Depends`
  contra los repos configurados y emite líneas parseables: `Inst`, `Conf`,
  `Remv`, más el resumen "N newly installed, M to remove". El archivo local
  aparece con origen `local-deb`. `apt -s`/`--dry-run` es equivalente.
- Ojo (fuente: guía de instalación .deb en Ubuntu): la simulación **no** valida
  arquitectura ni es prueba de que el paquete real instale limpio; hay que
  comprobar `dpkg-deb -f … Architecture` contra `dpkg --print-architecture`
  aparte.
- `apt-get -s` corre sin privilegios; con `LANG=C` el parseo es estable.

Procedencia / firma (nivel L4):

- `LANG=C apt-cache policy <nombre>` y `apt-cache madison <nombre>`: si no
  aparece, el paquete **no está en ningún repositorio configurado** (señal
  fuerte: procedencia no verificable). Si aparece, se puede comparar la versión
  del repo con la del archivo; misma versión + distinto `sha256` = posible
  reempaquetado.
- Firma: si existe `_gpgorigin`, `debsig-verify` la valida (requiere políticas
  en `/etc/debsig/policies` y keyring; suele **no** estar instalado). Alternativa
  manual: `ar x file.deb _gpgorigin` y `gpg --verify _gpgorigin debian-binary
  control.tar.* data.tar.*` (el orden de los tres archivos es obligatorio o la
  firma sale BAD).
- Realidad: el propio manual de `dpkg-deb` dice explícitamente "**There is no
  authentication on .deb files**". Un `.deb` de terceros casi nunca trae firma
  embebida. El análisis honesto es: `firmado (clave X)` vs `sin firma` vs `no
  está en ningún repo`, no un veredicto de malicioso.

Lo que **no** es posible / no se debe intentar:

- Reconstruir la autenticación de repositorio para un archivo suelto: no existe.
- Saber qué hará realmente un script de mantenedor sin ejecutarlo o auditarlo;
  solo se puede heurística + mostrar el crudo al usuario.
- `lintian` (análisis estático exhaustivo de paquetes) no viene instalado por
  defecto y es pesado; depender de él rompería la app en máquinas limpias.
- Ejecutar los scripts en sandbox: no hay sandbox para deb; queda fuera de
  alcance.
- **Regla de oro del manual de dpkg-deb**: tratar archivos `.deb` no confiables
  es una frontera de seguridad (hay parsers de compresión de por medio). Todo
  el análisis debe correr como el usuario de la app, **nunca** como root.

## Restricciones del sandbox de kliaStore

El manifiesto Flatpak expone solo: `host-os:ro`, `host-etc:ro`,
`xdg-download`, `xdg-data/flatpak:ro`, `xdg-data/applications:ro`,
`/var/lib/flatpak:ro`, `~/.var/app`, y `--talk-name=org.freedesktop.Flatpak`.
**No** hay `--filesystem=host`.

Implicaciones:

- El análisis se ejecuta en el host con `flatpak-spawn --host <cmd>` cuando
  `is_running_in_flatpak()`, igual que `debs.rs` y `inspect_local_flatpak`.
- Si el `.deb` está en `~/Descargas` (xdg-download) todo funciona. Si está fuera
  de los directorios expuestos y llega por el file picker, el path puede ser del
  portal (`/run/user/<uid>/doc/<hash>/x.deb`): ese path existe también en el
  host (xdg-document-portal corre en el host), así que `flatpak-spawn --host`
  y `pkexec` pueden leerlo mientras el documento siga abierto. Hay que
  mantenerlo en mente; alternativa robusta: copiar el `.deb` a
  `app_data_dir`/scratch antes de analizar (solo lectura, sin root), y pasar esa
  ruta al host.
- El path es controlado por el usuario → `shell_quote()` como ya se hace
  (`lib.rs` `inspect_local_flatpak`), y pasar el nombre de paquete como
  argumento separado, nunca interpolado.
- La instalación real necesita root → `flatpak-spawn --host sh -c "exec pkexec
  apt-get install -y -- \"$1\"" sh <path>` (mismo patrón que
  `uninstall_deb_package`), autenticando por el agente polkit del escritorio.
  No hace falta setuid ni tocar el manifiesto.

## Diseño propuesto

### Flujo

1. Entrada: doble clic en el gestor (MimeType nuevo → emite `open-local-deb`)
   o arrastrar/abrir desde la app.
2. Fase `loading` → comando nuevo `inspect_local_deb(file_path)` (solo lectura,
   host si hace falta).
3. Fase `review` → modal hermano de `LocalFlatpakInstallModal`, con secciones:
   identidad, tamaño y huella, análisis de seguridad, dependencias, escritura en
   el sistema, y nota de origen.
4. Fase `installing` → `install_local_deb(file_path, allowDowngrade)` con el
   pipeline PTY y `refreshInstalledPackages()` al terminar.
5. Fase `done`/`error`.

### Modelo de datos (Rust → TS)

```
DebLocalInfo {
  // identidad
  package, name, version, architecture, source, maintainer, homepage,
  description, section, priority, essential: bool, multi_arch, conffiles[],
  // tamaño / huella
  file_size_bytes, installed_size_kb, sha256,
  // procedencia
  in_configured_repo: bool, repo_version: Option<String>,
  signed: bool, signer: Option<String>,
  // dependencias (declaradas + resueltas por apt -s)
  depends[], pre_depends[], recommends[], suggests[], conflicts[], breaks[], replaces[],
  install_plan: { new: [...], upgrade: [...], remove: [...], kept: usize },
  // seguridad
  maintainer_scripts: [{ name, bytes, flags[] }],   // preinst/postinst/prerm/postrm/config/triggers
  setuid_files: [String],
  system_paths: [{ path, category }],               // service/cron/autostart/profile/pm/polkit/udev/apt/pam/sudoers
  already_installed: bool, installed_version: Option<String>,
  verdict: { level: "ok"|"warn"|"risk"|"block", blockers: [String], warnings: [String] }
}
```

### Señales de riesgo para deb (equivalente a `classifyPermissions`)

Nivel `block` (deshabilita Instalar):

- `Architecture` ≠ `dpkg --print-architecture` (dpkg rechazaría el unpack).
- `Essential: true`.
- `Section: metapackages` (arrastraría el escritorio, igual que el guard de
  `uninstall_deb_package`).
- La simulación `apt -s` incluye `Remv` de paquetes `Essential: yes`.

Nivel `risk`/`warn`:

- Scripts de mantenedor presentes: siempre hay que enseñarlos; se marcan `warn`
  por defecto y `risk` si el contenido tiene patrones peligrosos
  (`curl … | sh`, `wget … -O- | sh`, `base64 -d`, `eval`, `useradd`/`passwd`,
  `chmod u+s`, `chmod 4755`, `setcap`, `systemctl enable`, `insmod`,
  `dd of=/dev/`, `rm -rf /`, escritura en `~/.ssh`, `crontab`).
- Binarios `setuid`/`setgid` en el data (privilege escalation).
- Escrituras en rutas de persistencia: `/etc/systemd/system`, `/lib/systemd/system`,
  `/usr/lib/systemd/system`, `/etc/init.d`, `/etc/cron.*`, `/etc/xdg/autostart`,
  `/etc/profile.d`, `/etc/ld.so.conf.d`, `/etc/sudoers.d`, `/etc/polkit-1`,
  `/usr/share/polkit-1/actions`, `/usr/lib/udev/rules.d`, `/lib/modules`,
  `/etc/pam.d`, `/etc/security`, `/etc/apt/apt.conf.d`, `/etc/apt/sources.list.d`.
- `Pre-Depends` no vacío (se exige antes de desempaquetar).
- Sin firma embebida y/o `apt-cache policy` vacío (procedencia no verificable).
- `Conflicts`/`Breaks`/`Replaces` no vacíos.
- Versión instalada mayor que la del archivo (downgrade → requiere flag).

Nivel `ok`:

- Sin scripts, sin setuid, sin rutas de sistema, arquitectura correcta, presente
  en repo con la misma versión y huella.

### Instalación

```
# host, sin sandbox
pkexec apt-get install -y -- <path>            # o --allow-downgrades si el usuario lo eligió
# si el sandbox está activo: flatpak-spawn --host sh -c 'exec pkexec apt-get install -y -- "$1"' sh <path>
```

Se prefiere `apt-get install ./x.deb` sobre `dpkg -i` porque resuelve
dependencias desde los repos en la misma pasada (el `dpkg -i` falla dejando el
paquete sin configurar y exige `apt --fix-broken install`).

### UI

Reutilizar el modal Flatpak con copia propia (`LocalDebInstallModal.tsx`), no
parametrizar el existente: los bloques de "permisos" y "runtimes" no aplican y
la lógica de riesgo es distinta. Copy de UI en inglés (convención del repo);
los avisos de seguridad deben dejar claro que un deb **no está enjaulado**.

## Decisiones tomadas (híbrido)

1. Análisis completo: metadatos + contenido + scripts + procedencia. El plan de
   dependencias **no** se calcula durante la inspección: requiere listas de
   paquetes frescas y por tanto root, así que el usuario lo pide con el botón
   "Check dependencies". Ese botón lanza `check_local_deb_dependencies`, que
   ejecuta `pkexec sh -c '<apt-get update -qq; apt-get -s install f.deb>'`: el
   password lo pide el agente polkit del escritorio y klia-store nunca lo ve ni
   lo guarda. Si se cancela la autenticación (pkexec 126/127) el modal muestra
   el motivo y no inventa un plan.
2. Los scripts de mantenedor se clasifican por patrones y se pueden abrir en
   crudo; lo mismo el control completo y la salida de `apt-get update` +
   `apt-get -s`.
2b. `pkexec` se invoca con `--disable-internal-agent`: el agente de texto de
   pkexec necesita un terminal de control, que una app GUI no tiene (y en
   `tauri dev` pediría la contraseña en el terminal de compilación). Si la
   sesión no tiene ningún agente polkit registrado, pkexec falla al instante con
   "No authentication agent found" y el backend degrada a la simulación sin
   root (listas ya en disco), devolviendo `privileged=false` + `notice`; el modal
   muestra ese aviso en lugar de fallar. Si el usuario cancela el diálogo
   (126/127), se informa del rechazo y no se muestra plan.
3. Los bloqueos duros (arquitectura, `Essential`, `Section=metapackages`,
   simulación que remueva esenciales) no se pueden forzar: el botón queda
   deshabilitado y el backend vuelve a comprobarlo antes de `apt-get`.
4. Downgrade permitido solo tras un clic explícito en el aviso; se traduce a
   `--allow-downgrades`.
5. El `.deb` se usa en su ruta original (no se copia), igual que el flujo
   Flatpak; el portal de documentos existe también en el host.

## Verificación

```
pnpm run build
pnpm run test
cd src-tauri && cargo test
# pipeline completo sobre un .deb real:
KLIA_TEST_DEB=/ruta/pkg.deb cargo test --lib local_deb -- --ignored --nocapture
# puerta de instalación sobre un paquete Essential:
KLIA_TEST_DEB=/ruta/essential.deb KLIA_TEST_DEB_EXPECT=block \
  cargo test --lib local_deb -- --ignored
```
