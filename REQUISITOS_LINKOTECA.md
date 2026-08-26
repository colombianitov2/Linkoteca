# Requisitos de Linkoteca

1. Guardar y administrar enlaces exclusivamente en almacenamiento local.
2. Escuchar únicamente en `127.0.0.1`.
3. Exigir una sesión local para crear, editar, importar, archivar o borrar.
4. Conservar respaldos recuperables y escribir la base atómicamente.
5. Exportar únicamente campos de biblioteca permitidos.
6. Permitir importar el respaldo de enlaces activos en una sola carpeta `Todos`.
7. Bloquear SSRF hacia localhost, redes privadas, link-local, metadata y destinos reservados, incluidos todos los saltos de redirección.
8. No incluir sincronización, credenciales, publicación ni actualización automática.
9. Mantener separada la aplicación instalada de la copia de desarrollo.
10. Ejecutar pruebas locales antes de preparar cualquier versión futura.
