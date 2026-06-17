# Empaquetado Windows

Linkoteca se empaqueta como aplicación de escritorio para Windows usando Electron y electron-builder.

## Crear ejecutables localmente

```powershell
npm install
npm run dist:win
```

Los ejecutables quedan en la carpeta `dist`:

- `Linkoteca Setup <version>.exe`
- `Linkoteca <version>.exe`

## Publicar en GitHub

Al subir un tag como `v1.0.0`, GitHub Actions genera:

- `Linkoteca-Windows-Setup.exe`
- `Linkoteca-Windows-Portable.exe`

El workflow publica esos archivos como una release normal de GitHub.
