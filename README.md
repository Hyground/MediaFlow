# Mediaflow

Aplicación web en español para descargar video y audio de enlaces públicos compatibles con yt-dlp. Backend Node.js 22+, yt-dlp, FFmpeg y una interfaz adaptable sin dependencias de frontend ni servicios externos de conversión.

## Windows sin Docker ni Python (recomendado)

Haz doble clic en **Iniciar Mediaflow.cmd**. Node.js ya está instalado en este equipo. La primera vez descarga yt-dlp desde su repositorio oficial y FFmpeg desde Gyan, comprueba sus hashes SHA-256 y guarda los ejecutables dentro de `.runtime/`. No necesita administrador, no cambia el PATH de Windows y no requiere reiniciar. Las siguientes veces reutiliza los archivos descargados.

Cuando las dependencias estén listas, inicia el servidor en segundo plano y abre http://localhost:3000 en el navegador. Los registros están en `.runtime/server.log`. El servidor termina al apagar Windows; abre de nuevo el iniciador cuando lo necesites. Los archivos extraídos de FFmpeg incluyen su licencia dentro de `.runtime/ffmpeg-package/`.

Para ejecutar el servidor en una consola que puedas cerrar con Ctrl+C, usa `node server.mjs` después de completar la instalación. No lo inicies dos veces en el mismo puerto.

Si aparece un error de conexión, revisa el acceso a GitHub y gyan.dev y vuelve a abrir el iniciador. La preparación desde el entorno del asistente encontró un bloqueo de red (`EACCES`); los binarios no pudieron descargarse durante esa preparación.

## Iniciar con Docker (alternativa)

Instala Docker Desktop y, desde esta carpeta, ejecuta:

```powershell
docker compose up --build -d
```

Abre **http://localhost:3000**. Para detener:

```powershell
docker compose down
```

## Iniciar sin Docker en Windows

Instala Node.js 22 o superior, Python 3.11 o superior y FFmpeg. Python y FFmpeg deben estar en PATH. Después:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:PYTHON = "$PWD\.venv\Scripts\python.exe"
npm.cmd start
```

Para Linux/macOS usa `python3 -m venv .venv`, `.venv/bin/pip install -r requirements.txt` y `PYTHON="$PWD/.venv/bin/python" npm start`.

## Uso

1. Pega un enlace público de un video individual y pulsa **Analizar enlace**.
2. Selecciona video (MP4, WebM, MKV) o audio (MP3, M4A, Opus, FLAC, WAV).
3. Elige resolución hasta 2160p o bitrate de audio de 128 a 320 kbps.
4. Añade a la cola y pulsa **Guardar archivo** al terminar.

Se ejecutan hasta dos descargas a la vez; la cola admite ocho trabajos activos. Puedes cancelar o eliminar cada descarga. Los archivos caducan 24 horas después de crear el trabajo. El historial reside en memoria: reiniciar elimina el historial y los archivos anteriores. No se descarga automáticamente al dispositivo hasta pulsar Guardar.

La resolución elegida es un máximo: depende de lo que ofrezca la fuente. MP4 prioriza H.264 y M4A, WebM prioriza sus streams nativos y MKV conserva los mejores streams; yt-dlp convierte cuando hace falta. Una conversión puede tardar. FLAC/WAV no recuperan calidad perdida; su bitrate no se controla como el de MP3. La fuente puede entregar audio a menos bitrate que el seleccionado.

## Compatibilidad y mantenimiento

No existe compatibilidad garantizada con cualquier sitio. YouTube y otras plataformas pueden cambiar sus mecanismos, limitar IPs o exigir verificación. La aplicación no elude DRM, acceso privado ni inicio de sesión; no importa cookies. No admite listas ni directos. Úsala para contenido propio o autorizado.

yt-dlp necesita FFmpeg para combinar y convertir y un runtime JavaScript para determinados enlaces de YouTube. La imagen incluye Node y `yt-dlp[default]`, que instala sus componentes EJS. Documentación oficial: https://github.com/yt-dlp/yt-dlp y https://github.com/yt-dlp/yt-dlp/wiki/EJS.

Para actualizar extractores con Docker:

```powershell
docker compose build --no-cache
docker compose up -d
```

Sin Docker: `.\.venv\Scripts\python.exe -m pip install -U -r requirements.txt`.

## Alcance del despliegue

La configuración está preparada para uso local de confianza, sin cuentas. Docker publica exclusivamente en 127.0.0.1. No expongas este puerto directamente a Internet: para un servicio público se requiere autenticación, cuotas por usuario, almacenamiento aislado, cola persistente y un proxy de salida que bloquee redes internas también en redirecciones y conexiones de extractores. La validación inicial de URL no puede garantizar eso por sí sola.

Los procesos tienen un tiempo máximo de 30 minutos; yt-dlp recibe un máximo de 2 GB por stream conocido, que no constituye una cuota estricta de disco para fuentes sin tamaño ni archivos combinados. Conserva espacio disponible. Los enlaces se pasan como argumentos sin shell; se rechazan protocolos no HTTP, redes privadas iniciales y orígenes ajenos. La aplicación comprueba Host para mitigar DNS rebinding. `ALLOWED_HOSTS` admite una lista de hosts separados por comas si utilizas un proxy propio; `HOST` y `PORT` controlan la escucha.

## Comprobaciones

```powershell
npm.cmd run check
npm.cmd test
```

Las pruebas cubren validación de enlaces, formatos, selección de calidad, rutas HTTP y bloqueo de orígenes externos. Para la comprobación completa, inicia las dependencias, analiza un video público autorizado, descarga MP4 y MP3, abre ambos archivos y prueba cancelar una descarga activa. No se incluyen pruebas de red contra plataformas de terceros para evitar depender de su disponibilidad.

## API

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/health` | Estado de yt-dlp y FFmpeg |
| POST | `/api/analyze` | `{ "url": "https://…" }` → título, autor, duración, alturas |
| POST | `/api/jobs` | `{ "url": "https://…", "title": "…", "kind": "video", "format": "mp4", "quality": "1080" }` |
| GET | `/api/jobs` | Historial y progreso |
| DELETE | `/api/jobs/:id` | Cancelar trabajo activo o eliminar archivo terminado |
| GET | `/api/jobs/:id/file` | Descargar el archivo terminado |
