# Linkoteca [PRE RELEASE]

App real de escritorio y movil para organizar enlaces como una galeria visual por carpetas.

## Estado beta

- Version: `0.3.0-beta.1`.
- Repositorio previsto: `https://github.com/colombianitov2/linkoteca-beta`.
- La beta nueva arranca vacia: sin enlaces, sin carpetas y sin datos personales preinstalados.
- Las carpetas se crean solo cuando el usuario agrega, comparte o importa enlaces.
- Los ejecutables se publican como artefactos/release de GitHub Actions, no como una pagina HTML.

## Reglas de seguridad

- La base de desarrollo vive en `D:\Proyectos de desarrollo de Software\Linkoteca\Linkoteca_Main\data\linkoteca.json`.
- `data/*.json` no se sube al repositorio porque contiene datos personales del usuario.
- La app puede exportar o sincronizar en una carpeta elegida por el usuario.
- La ruta `D:\Nube` esta bloqueada.
- `D:\Nube\Fotos y videos` se considera solo referencia historica y nunca destino.
- El Excel `C:\Users\erpec\Desktop\Links.xlsx` se usa como fuente de importacion. Esta version no lo modifica automaticamente.

## Ejecutar

```powershell
npm install
npm run import:excel
npm start
```

Luego abre:

```text
http://localhost:4387
```

## Funciones principales

- Galeria visual tipo YouTube con miniatura, titulo, descripcion y carpeta.
- Auto-clasificacion heuristica por URL, titulo, descripcion y categorias existentes.
- Clasificacion por lotes desde el boton `Auto-clasificar`.
- Busqueda de carpetas en el sidebar para manejar muchas clasificaciones.
- Carpetas, busqueda, duplicados, papelera y restauracion.
- Configuracion con creditos, reportes, donaciones, actualizaciones e instalacion PWA.
- Exportacion en JSON, CSV, TXT, XLS y galeria estatica por carpetas.
- Exportacion directa de galeria al Escritorio.
- Sincronizacion con Google Drive por OAuth, Nextcloud WebDAV, servidor por IP o carpetas locales sincronizadas por OneDrive.
- Favicon como miniatura de respaldo cuando un sitio no entrega imagen OpenGraph.
- Recepcion de enlaces desde el menu `Compartir` en Android y PWA compatible; los enlaces llegan a `Por revisar`.

## Ejecutables

- Windows: `npm run dist:win`
- Android: `npm run dist:android`
- Mac: `npm run dist:mac` desde macOS

El repo incluye `.github/workflows/beta-release.yml` para construir Windows, Android y macOS en GitHub Actions. Al crear un tag como `v0.3.0-beta.1`, GitHub publica un prerelease con:

- `Linkoteca-Windows-Setup.exe`
- `Linkoteca-Windows-Portable.exe`
- `Linkoteca-Android-debug.apk`
- `Linkoteca-macOS.dmg`

Ver detalles en [PACKAGING.md](PACKAGING.md).

## Uso desde Microsoft Edge

Linkoteca puede guardarse en favoritos de Edge siempre que el favorito apunte a:

```text
http://localhost:4387
```

El servidor debe estar corriendo con `npm start` o `Abrir Linkoteca.bat`.

Tambien puede instalarse como PWA desde Edge. En celular o tablet se puede abrir usando la IP del PC, por ejemplo:

```text
http://192.168.1.50:4387
```

Si el servidor no esta disponible, la app muestra el dialogo `Conectar Linkoteca` para usar el equipo local o escribir la IP del servidor.

## Compartir enlaces desde celular

### Android

La APK de Linkoteca esta declarada como destino de `Compartir` para contenido de texto. Cuando el usuario comparte un enlace desde YouTube, Instagram, Edge u otra app compatible, Android debe mostrar `Linkoteca` como opcion. Al elegirla:

1. Linkoteca abre la app.
2. Extrae el primer enlace `http` o `https` del texto compartido.
3. Si el celular ya esta conectado al servidor de Linkoteca, guarda el enlace en `Por revisar`.
4. Si todavia no hay conexion al servidor, deja el enlace en cola local y lo guarda al conectar la IP/repositorio.

### PWA

El manifiesto web tambien incluye `share_target`. En navegadores y sistemas que soporten compartir hacia PWAs instaladas, Linkoteca puede recibir `title`, `text` y `url` desde el menu `Compartir`.

### iOS

Para una app iOS nativa se necesita agregar una `Share Extension` desde Xcode en macOS. Desde Windows no se puede compilar ni probar esa extension, pero la logica web ya esta preparada para recibir enlaces compartidos cuando el sistema entregue `title`, `text` o `url`.

## Backup con Google Drive

La beta incluye conexion OAuth con Google Drive. Para activarla:

1. Crea un OAuth Client en Google Cloud para app web/local.
2. Usa como redirect URI:

```text
http://localhost:4387/api/google/callback
```

3. En Linkoteca abre `Configuración > Nube y sincronización`.
4. Elige `Google Drive con cuenta`.
5. Pega `Google Client ID` y `Google Client Secret`.
6. Pulsa `Conectar Google`.
7. Usa `Subir nube` o `Descargar nube`.

El backup se guarda como `linkoteca.json` dentro de `appDataFolder`, el espacio privado de Linkoteca en Google Drive.
