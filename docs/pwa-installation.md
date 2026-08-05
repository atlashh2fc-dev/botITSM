# Instalación del Asistente Forum

El bot se distribuye como una PWA: no se descarga un ejecutable `.exe` y no
requiere permisos de administrador.

1. Abrir `https://iabot.atlasitsm.geimser.cl/dashboard` desde el botón Forum del ITSM.
2. En Chrome o Edge, elegir **Instalar aplicación** cuando aparezca el botón.
3. En iPhone/iPad, abrir en Safari y usar **Compartir > Agregar a inicio**.

La aplicación se abre en una ventana propia. La sesión, tickets y datos siguen
consultándose en línea desde el ITSM Forum; el service worker no cachea rutas
`/api`, por lo que no conserva ni mezcla datos de los tenants.
