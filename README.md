# Linkoteca

Linkoteca 1.0.4 es una biblioteca visual de enlaces para Windows. Todos los datos se guardan localmente en el equipo; la aplicación no incorpora sincronización en la nube ni credenciales de usuario. Las actualizaciones se consultan y descargan desde las versiones públicas de GitHub.

## Desarrollo

```powershell
npm install
npm run check
npm start
```

La interfaz de desarrollo queda disponible únicamente en `http://127.0.0.1:4387`.

## Datos

- Desarrollo: `data/linkoteca.json`.
- Aplicación instalada: `<perfil de la aplicación>/workspace/data/linkoteca.json`.
- Antes de una operación importante, crea un respaldo local de enlaces activos con `scripts/create-active-links-backup.mjs`.
- El respaldo especial se restaura siempre dentro de una única carpeta llamada `Todos`.

Las exportaciones JSON usan una lista explícita de campos y no incluyen configuración interna ni secretos.

## Seguridad local

- El servidor escucha exclusivamente en `127.0.0.1`.
- Las mutaciones requieren un token aleatorio de la sesión local.
- Las escrituras de la base usan archivo temporal, sincronización y reemplazo atómico.
- Las vistas previas bloquean hosts locales, IP privadas, link-local, metadata y redirecciones hacia esos destinos.

## Autor

Ernesto Pernett. Perfil informativo: `https://github.com/colombianitov2`.
