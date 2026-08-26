# Empaquetado local de Linkoteca

Versión publicada: `1.0.4`.

## Validar

```powershell
npm run check
```

## Ejecutar

```powershell
npm start
npm run desktop
```

## Generar instalador local

```powershell
npm run dist:win
```

El comando genera artefactos solo en `dist`. No publica, etiqueta ni transfiere archivos.

Los datos persistentes de la aplicación instalada viven en el perfil de usuario, dentro de `workspace/data`, y no deben incorporarse al instalador.
