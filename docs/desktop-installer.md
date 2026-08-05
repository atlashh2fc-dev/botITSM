# Instalador Windows: Asistente ITSM Forum

El instalador contiene un cliente de escritorio Electron, limitado a la vista
`/asistente`. No incluye dashboard, CMDB ni el escritorio de demostración.

El cliente requiere conexión a Internet porque consulta en vivo la sesión,
tickets y conocimiento del ITSM Forum. No empaqueta tokens, credenciales ni una
copia de datos de Supabase/Zammad.

## Construcción

```powershell
npm.cmd install
npm.cmd run desktop:build
```

El archivo se genera bajo `installer/` con el nombre
`Asistente-ITSM-Forum-Setup-<versión>.exe`.

Al ejecutarlo en Windows, el login se abre en una ventana controlada del ITSM y
vuelve al programa para entregar la sesión Forum.

## Ventana flotante

El asistente funciona como una burbuja de escritorio: permanece sobre las
demás ventanas, está disponible en todos los escritorios virtuales y se inicia
al ingresar a Windows. Al cerrar la ventana, sigue disponible en el ícono de
notificación de Forum; desde ahí se puede volver a abrir o salir por completo.
