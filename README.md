# Linkoteca

Linkoteca es una app de escritorio para Windows creada para guardar, ordenar y recuperar enlaces personales desde una biblioteca visual.

## Para qué sirve

- Guardar enlaces de YouTube, Instagram, Facebook, páginas web y otros sitios.
- Organizar los enlaces por carpetas.
- Ver tarjetas con título, descripción, miniatura y plataforma cuando el sitio entrega vista previa.
- Buscar enlaces, detectar duplicados y mover elementos a la papelera antes de eliminarlos definitivamente.
- Exportar la biblioteca completa con enlaces, carpetas y propiedades para tener una copia ordenada fuera de la app.
- Sincronizar o respaldar la base de enlaces en una ubicación elegida por el usuario.

## Ejecutable Windows

La app se entrega como instalador de Windows:

- `Linkoteca-Windows-Setup.exe`: instalador recomendado.
- `Linkoteca-Windows-Portable.exe`: versión portable para abrir sin instalar.

La descarga oficial está en la sección de releases del repositorio.

## Cómo fue hecha

- Escritorio: Electron.
- Servidor local: Node.js con Express.
- Interfaz: HTML, CSS y JavaScript.
- Instalador: electron-builder.
- Publicación: GitHub Actions genera el instalador y lo adjunta a cada release.

Linkoteca guarda la biblioteca en el equipo del usuario y no necesita cuentas externas para funcionar.
