# Requisitos de Linkoteca

## Alcance vigente

- App real de escritorio para Windows, no una pagina HTML suelta.
- Biblioteca visual de enlaces sencilla, moderna y tipo galeria.
- Tarjetas con miniatura o caratula, titulo, descripcion/plataforma y acciones.
- Creacion manual de carpetas con el nombre que el usuario decida.
- Creacion de grupos desplegables para organizar carpetas.
- Guardar enlaces dentro de la carpeta elegida por el usuario.
- Cambiar o mover enlaces de carpeta como en una galeria normal.
- Buscar enlaces y carpetas.
- Usar Todos como bandeja de enlaces sin carpeta, con filtros por fecha.
- Copiar el enlace al portapapeles.
- Abrir el enlace original.
- Borrar enlaces y enviarlos a Papelera.
- Restaurar enlaces desde Papelera.
- Borrar carpetas vacias.
- Bloquear el borrado de carpetas con enlaces activos.
- Evitar informacion mezclada.
- Permitir muchas carpetas/categorias sin un limite practico.
- Sincronizar automaticamente al abrir si el usuario activa esa opcion.
- Usar un solo formato de banco de datos para backup y transferencia: linkoteca.json.
- Permitir descargar y exportar el banco linkoteca.json.
- Permitir elegir carpeta local de almacenamiento/exportacion.
- Permitir conexion con Nextcloud por WebDAV.
- Permitir conexion con Google Drive por OAuth.
- Permitir conexion con OneDrive mediante carpeta local sincronizada.
- Permitir conexion con una IP o servidor propio.
- Permitir subir y descargar el banco de enlaces desde nube o carpeta local.
- Configuracion con creditos.
- Creditos del propietario: Ernesto Pernett - Ingeniero Mecanico.
- Creditos de asistencia tecnica/desarrollo con Codex de OpenAI.
- Boton unico al perfil de GitHub del desarrollador.
- Boton de actualizaciones.
- Verificar version mas reciente.
- Descarga exclusiva para Windows.
- Instrucciones rapidas dentro de la app.
- Beta limpia: sin datos personales, sin carpetas y sin enlaces preinstalados.
- Mantener bloqueada la ruta D:\Nube y D:\Nube\Fotos y videos.
- Preparacion para instalador y ejecutable portable de Windows.
- Trabajar primero en local y subir a GitHub despues de probar.

## Descartado por decision del usuario

- Analisis real de audio o video con Whisper.
- Analisis de frames.
- Flujo principal basado en Excel o pestanas de Excel.
- Pagina de descarga amigable para usuario no tecnico.
- Multiples formatos principales de banco de datos como Excel, CSV o TXT.

## Pendiente por probar con usuario

- Probar instalador de Windows generado por GitHub Actions.
- Probar Google Drive con credenciales OAuth reales del usuario.
- Probar Nextcloud/WebDAV con la cuenta real del usuario.
- Probar OneDrive/carpeta sincronizada con una carpeta real elegida por el usuario.
- Probar flujo completo de actualizacion desde GitHub Releases.
