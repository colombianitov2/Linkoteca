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
D:\Proyectos de desarrollo de Software\Linkoteca\Linkoteca_Main\dist\Linkoteca Setup 0.3.0-beta.1.exe
D:\Proyectos de desarrollo de Software\Linkoteca\Linkoteca_Main\dist\Linkoteca 0.3.0-beta.1.exe
```

El primero es instalador. El segundo es portable.

## Generar Android

Android funciona como cliente movil. El celular se conecta al servidor de Linkoteca en el PC por IP.
La APK tambien aparece en el menu `Compartir` de Android cuando otra app envia texto o enlaces; los enlaces compartidos se guardan en `Por revisar`.

1. En el PC abre Linkoteca:

```powershell
npm start
```

2. Busca la IP del PC:

```powershell
ipconfig
```

3. En el celular escribe una URL como:

```text
http://192.168.1.50:4387
```

4. Para compilar el APK necesitas Android Studio, Android SDK configurado y JDK 21 LTS. Si Windows usa una Java mas nueva, ejecuta el build con `JAVA_HOME` apuntando a JDK 21:

```powershell
cd "D:\Proyectos de desarrollo de Software\Linkoteca\Linkoteca_Main"
$env:JAVA_HOME="C:\Program Files\Android\openjdk\jdk-21.0.8"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
npm run dist:android
```

El APK debug queda en:

```text
D:\Proyectos de desarrollo de Software\Linkoteca\Linkoteca_Main\android\app\build\outputs\apk\debug\app-debug.apk
```

Si quieres firmar para publicar en Play Store, abre la carpeta `android` en Android Studio y genera un build firmado.

## Generar Mac

El ejecutable de Mac debe compilarse en macOS.

En una Mac:

```bash
cd "Linkoteca"
npm install
npm run dist:mac
```

El `.dmg` y `.zip` quedan en la carpeta `dist`.

## Datos del usuario

En desarrollo los datos viven en:

```text
D:\Proyectos de desarrollo de Software\Linkoteca\Linkoteca_Main\data\linkoteca.json
```

En el ejecutable de escritorio, los datos se copian al perfil del usuario de la app. Eso evita escribir dentro del instalador y conserva la biblioteca aunque actualices el programa.

## Seguridad de rutas

La ruta `D:\Nube` y `D:\Nube\Fotos y videos` siguen bloqueadas. La app no debe escribir ahi.
