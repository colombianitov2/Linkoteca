# Empaquetado de Linkoteca

## Probar en desarrollo

```powershell
cd "D:\Proyectos de desarrollo de Software\Linkoteca\Linkoteca_Main"
npm start
```

La interfaz queda en:

```text
http://localhost:4387
```

## Probar como app de escritorio

```powershell
cd "D:\Proyectos de desarrollo de Software\Linkoteca\Linkoteca_Main"
npm run desktop
```

Esta version usa Electron y levanta el servidor interno automaticamente.

## Generar Windows

```powershell
cd "D:\Proyectos de desarrollo de Software\Linkoteca\Linkoteca_Main"
npm run dist:win
```

Archivos generados:

```text
D:\Proyectos de desarrollo de Software\Linkoteca\Linkoteca_Main\dist\Linkoteca Setup <version>.exe
```

Es el único instalador para Windows y también es utilizado por la actualización automática.

## Datos del usuario

En desarrollo los datos viven en:

```text
D:\Proyectos de desarrollo de Software\Linkoteca\Linkoteca_Main\data\linkoteca.json
```

En el ejecutable de escritorio, los datos se copian al perfil del usuario de la app. Eso evita escribir dentro del instalador y conserva la biblioteca aunque actualices el programa.

## Seguridad de rutas

La ruta `D:\Nube` y `D:\Nube\Fotos y videos` siguen bloqueadas. La app no debe escribir ahi.
