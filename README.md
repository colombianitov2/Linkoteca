# Linkoteca [PRE RELEASE]

App de escritorio Windows para organizar enlaces como una galeria visual por carpetas.

## Estado beta

- Version: `0.3.0-beta.2`.
- Repositorio: `https://github.com/colombianitov2/Linkoteca`.
- La beta nueva arranca vacia: sin enlaces, sin carpetas y sin datos personales preinstalados.
- Las carpetas se crean solo cuando el usuario agrega, comparte o importa enlaces.
- En esta etapa se entrega como un solo ejecutable/instalador Windows.

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
- Busqueda de carpetas en el sidebar para manejar muchas categorias.
- Carpetas, busqueda, duplicados, papelera y restauracion.
- Configuracion con creditos, perfil de GitHub, verificacion de version, exportacion, nube y papelera.
- Exportacion completa en JSON, CSV, TXT y XLS.
- Exportacion directa al Escritorio con carpetas, accesos `.url`, resumen `.txt` y propiedades `.json` por enlace.
- Sincronizacion con Nextcloud WebDAV o servidor propio por URL/ruta de red.
- Favicon como miniatura de respaldo cuando un sitio no entrega imagen OpenGraph.

## Ejecutables

- Windows: `npm run dist:win`

El repo publica artefactos Windows al crear un tag como `v0.3.0-beta.2`:

- `Linkoteca-Windows-Setup.exe`
- `Linkoteca-Windows-Portable.exe`

Ver detalles en [PACKAGING.md](PACKAGING.md).

## Uso desde Microsoft Edge

Linkoteca puede guardarse en favoritos de Edge siempre que el favorito apunte a:

```text
http://localhost:4387
```

El servidor debe estar corriendo con `npm start` o `Abrir Linkoteca.bat`.

Si el servidor no esta disponible, la app muestra el dialogo `Conectar Linkoteca` para usar el equipo local o escribir la IP del servidor.

## Sincronizacion en red

Para usar una unidad de red en Windows:

1. Abre `Configuración > Nube y sincronización`.
2. En `Proveedor`, elige `IP / servidor propio`.
3. En `URL / servidor propio o ruta de red`, pega una ruta como `P:\Linkoteca` o `\\100.75.146.94\HDD_PROGRAMAS\Linkoteca`.
4. Usa `Subir nube` para crear o actualizar `linkoteca.json` en esa ruta.
5. Usa `Descargar nube` para traer esa copia y mezclarla con la biblioteca local.
