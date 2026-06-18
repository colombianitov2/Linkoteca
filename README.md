# Linkoteca

Biblioteca visual de enlaces para Windows. La app esta pensada para ser sencilla: el usuario crea carpetas, agrega enlaces dentro de ellas y Linkoteca muestra una vista previa con miniatura, titulo y descripcion cuando el sitio la entrega.

## Estado beta

- Version: `0.3.0-beta.2`.
- Repositorio: `https://github.com/colombianitov2/linkoteca-beta`.
- La beta nueva arranca vacia: sin enlaces, sin carpetas y sin datos personales preinstalados.
- La organizacion es manual: cada enlace queda en la carpeta que el usuario elija.
- El backup principal es un solo archivo `linkoteca.json`, facil de copiar, sincronizar o transferir a otro dispositivo.

## Reglas de seguridad

- La base de desarrollo vive en `D:\Proyectos de desarrollo de Software\Linkoteca\Linkoteca_Main\data\linkoteca.json`.
- `data/*.json` no se sube al repositorio porque puede contener datos personales.
- La app puede exportar o sincronizar en una carpeta elegida por el usuario.
- La ruta `D:\Nube` esta bloqueada.
- `D:\Nube\Fotos y videos` se considera solo referencia historica y nunca destino.

## Ejecutar

```powershell
cd "D:\Proyectos de desarrollo de Software\Linkoteca\Linkoteca_Main"
npm install
npm start
```

Luego abre:

```text
http://localhost:4387
```

## Funciones principales

- Galeria visual tipo YouTube con miniatura, titulo, descripcion y carpeta.
- Creacion manual de carpetas.
- Grupos desplegables para organizar carpetas y reducir el espacio del panel lateral.
- Busqueda de enlaces y carpetas.
- Bandeja Todos para enlaces sin carpeta, filtrable por fecha de ingreso.
- Mover enlaces entre carpetas.
- Borrar enlaces y restaurarlos desde Papelera.
- Borrar carpetas vacias.
- Copiar links al portapapeles.
- Configuracion con creditos, perfil de GitHub, actualizaciones y descarga para Windows.
- Backup y sincronizacion con Google Drive por OAuth, Nextcloud WebDAV, servidor por IP o carpetas locales sincronizadas por OneDrive.
- Exportacion principal en JSON y galeria estatica por carpetas cuando se quiera una copia navegable.

## Ejecutables

- Windows: `npm run dist:win`

El repo incluye `.github/workflows/beta-release.yml` para construir Windows en GitHub Actions. Al crear un tag como `v0.3.0-beta.2`, GitHub publica un prerelease con:

- `Linkoteca-Windows-Setup.exe`
- `Linkoteca-Windows-Portable.exe`

Ver detalles en [PACKAGING.md](PACKAGING.md).

## Uso desde Microsoft Edge

Linkoteca puede guardarse en favoritos de Edge siempre que el favorito apunte a:

```text
http://localhost:4387
```

El servidor debe estar corriendo con `npm start` o `Abrir Linkoteca.bat`.

La distribución soportada es la aplicación de escritorio para Windows.

## Backup con Google Drive

La beta incluye conexion OAuth con Google Drive. Para activarla:

1. Crea un OAuth Client en Google Cloud para app web/local.
2. Usa como redirect URI:

```text
http://localhost:4387/api/google/callback
```

3. En Linkoteca abre `Configuracion > Nube y sincronizacion`.
4. Elige `Google Drive con cuenta`.
5. Pega `Google Client ID` y `Google Client Secret`.
6. Pulsa `Conectar Google`.
7. Usa `Subir nube` o `Descargar nube`.

El backup se guarda como `linkoteca.json` dentro de `appDataFolder`, el espacio privado de Linkoteca en Google Drive.
