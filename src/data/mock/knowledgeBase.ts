import type { ITSMIntent, KnowledgeArticle } from "@/lib/itsm/types";

export const knowledgeBase: KnowledgeArticle[] = [
  {
    id: "kb-password-mail",
    title: "Reset y validación de acceso a correo corporativo",
    category: "Identidad y productividad",
    intent: "ACCESS_REQUEST",
    symptoms: ["No puede acceder a correo", "Clave expirada", "MFA bloqueado"],
    resolutionSteps: [
      "Validar si el usuario puede ingresar al portal de identidad corporativa.",
      "Confirmar que el segundo factor de autenticación esté disponible.",
      "Solicitar reset de contraseña desde el flujo autorizado de autoservicio.",
      "Cerrar sesiones antiguas y reintentar acceso al correo.",
    ],
    escalationCriteria: [
      "El usuario no supera MFA luego de validación.",
      "La cuenta aparece bloqueada o deshabilitada.",
      "Hay sospecha de acceso no autorizado.",
    ],
    tags: ["correo", "password", "clave", "mfa", "outlook", "login"],
  },
  {
    id: "kb-vpn-validation",
    title: "Validación de conectividad VPN",
    category: "Conectividad segura",
    intent: "NETWORK_ISSUE",
    symptoms: ["VPN no conecta", "Timeout", "Credenciales rechazadas", "Sin acceso remoto"],
    resolutionSteps: [
      "Confirmar conexión a internet estable fuera de la VPN.",
      "Validar que la fecha y hora del equipo estén sincronizadas.",
      "Reiniciar el cliente VPN y autenticar nuevamente.",
      "Probar conexión desde otra red permitida.",
      "Registrar código de error visible si el fallo persiste.",
    ],
    escalationCriteria: [
      "El error afecta a múltiples usuarios.",
      "Hay indisponibilidad del concentrador VPN.",
      "El usuario tiene urgencia operativa alta y no existe workaround.",
    ],
    tags: ["vpn", "red", "remote", "conectividad", "teletrabajo"],
  },
  {
    id: "kb-authorized-software",
    title: "Instalación de software autorizado",
    category: "Gestión de requerimientos",
    intent: "SOFTWARE_REQUEST",
    symptoms: ["Necesita instalar software", "Aplicación no disponible", "Solicitud de licencia"],
    resolutionSteps: [
      "Verificar que el software esté en el catálogo autorizado.",
      "Confirmar aprobación del responsable del área si requiere licencia.",
      "Validar compatibilidad con el equipo y sistema operativo.",
      "Registrar requerimiento con justificación de negocio.",
    ],
    escalationCriteria: [
      "Software no catalogado.",
      "Requiere compra o asignación de licencia.",
      "Implica permisos administrativos o excepción de seguridad.",
    ],
    tags: ["software", "instalar", "licencia", "catálogo", "aplicación"],
  },
  {
    id: "kb-slow-notebook",
    title: "Diagnóstico básico de notebook lento",
    category: "Puesto de trabajo",
    intent: "HARDWARE_ISSUE",
    symptoms: ["Equipo lento", "Arranque demorado", "Aplicaciones congeladas"],
    resolutionSteps: [
      "Reiniciar el equipo si lleva más de 48 horas encendido.",
      "Cerrar aplicaciones de alto consumo no críticas.",
      "Validar espacio disponible en disco.",
      "Ejecutar actualización corporativa pendiente si está disponible.",
      "Registrar síntomas recurrentes y horario de mayor impacto.",
    ],
    escalationCriteria: [
      "El equipo presenta fallas de disco, temperatura o batería.",
      "La lentitud impide operar sistemas críticos.",
      "El diagnóstico básico no mejora la experiencia.",
    ],
    tags: ["notebook", "lento", "rendimiento", "hardware", "equipo"],
  },
  {
    id: "kb-excel-wont-open",
    title: "Excel u Office no abre",
    category: "Productividad Microsoft 365",
    intent: "INCIDENT",
    symptoms: ["Excel no abre", "Office no inicia", "Aplicación se cierra al abrir"],
    resolutionSteps: [
      "Confirmar si falla solo Excel o también Word, Outlook u otras aplicaciones de Office.",
      "Intentar abrir Excel en modo seguro para descartar complementos dañados.",
      "Reiniciar el equipo si Office quedó colgado o con procesos activos en segundo plano.",
      "Validar si aparece un mensaje de error o código al iniciar la aplicación.",
      "Escalar con versión de Office, equipo afectado y mensaje de error si la falla persiste.",
    ],
    escalationCriteria: [
      "La aplicación no abre después de modo seguro y reinicio.",
      "También fallan otras aplicaciones de Office.",
      "El usuario no puede operar archivos críticos o cierres de negocio.",
    ],
    tags: ["excel", "office", "microsoft 365", "no abre", "no inicia", "se cierra", "word", "powerpoint"],
  },
  {
    id: "kb-wired-peripheral",
    title: "Diagnóstico de mouse o teclado cableado",
    category: "Puesto de trabajo",
    intent: "HARDWARE_ISSUE",
    symptoms: ["Mouse no funciona", "Teclado no responde", "Periférico USB no detectado"],
    resolutionSteps: [
      "Confirmar si el periférico es cableado, inalámbrico o Bluetooth.",
      "Probar otro puerto USB del equipo, evitando hubs o adaptadores intermedios.",
      "Validar si el periférico enciende luz o aparece como dispositivo conectado.",
      "Probar otro periférico en el mismo equipo para aislar si falla el puerto o el accesorio.",
      "Registrar activo afectado y resultado del descarte antes de escalar.",
    ],
    escalationCriteria: [
      "El periférico no enciende ni es detectado en ningún puerto.",
      "Otro periférico tampoco funciona en el equipo.",
      "El usuario queda sin capacidad operativa para trabajar.",
    ],
    tags: ["mouse", "raton", "ratón", "teclado", "usb", "cable", "puerto", "enciende", "detecta", "conectado", "periferico", "periférico"],
  },
  {
    id: "kb-notebook-display",
    title: "Diagnóstico de pantalla integrada de notebook",
    category: "Puesto de trabajo",
    intent: "HARDWARE_ISSUE",
    symptoms: ["Pantalla de notebook sin imagen", "Pantalla interna parpadea", "Líneas o manchas en pantalla"],
    resolutionSteps: [
      "Confirmar si la falla corresponde a pantalla integrada o monitor externo.",
      "Validar brillo, energía y estado de suspensión del notebook.",
      "Reiniciar el equipo y observar si aparece imagen durante el arranque.",
      "Conectar monitor externo si está disponible para aislar pantalla interna versus gráfica del equipo.",
      "Registrar síntoma visual y activo antes de escalar a soporte en terreno.",
    ],
    escalationCriteria: [
      "La pantalla queda negra incluso durante el arranque.",
      "Existen líneas, manchas, daño físico o parpadeo persistente.",
      "El equipo no permite operar y no hay monitor externo disponible.",
    ],
    tags: ["pantalla", "notebook", "note", "laptop", "brillo", "negra", "parpadea", "lineas", "líneas", "manchas"],
  },
  {
    id: "kb-external-display",
    title: "Diagnóstico de monitor externo",
    category: "Puesto de trabajo",
    intent: "HARDWARE_ISSUE",
    symptoms: ["Monitor externo sin imagen", "Cable de video suelto", "Pantalla externa no detectada"],
    resolutionSteps: [
      "Confirmar si se trata de monitor externo o pantalla integrada del notebook.",
      "Validar energía del monitor, entrada seleccionada y firmeza del cable de video.",
      "Probar otro cable o puerto si está disponible.",
      "Validar si el notebook detecta la pantalla externa en configuración de pantalla.",
      "Registrar modelo de monitor, puerto usado y resultado del descarte antes de escalar.",
    ],
    escalationCriteria: [
      "El monitor no enciende pese a tener energía.",
      "El notebook no detecta ninguna pantalla externa.",
      "El usuario no puede operar por falta de pantalla alternativa.",
    ],
    tags: ["monitor", "externo", "hdmi", "displayport", "cable", "pantalla externa", "sin imagen"],
  },
  {
    id: "kb-shared-folder-access",
    title: "Solicitud de acceso a carpeta compartida",
    category: "Accesos y permisos",
    intent: "ACCESS_REQUEST",
    symptoms: ["Sin acceso a carpeta", "Permiso denegado", "Requiere carpeta compartida"],
    resolutionSteps: [
      "Identificar ruta o nombre de la carpeta compartida.",
      "Confirmar responsable del recurso y nivel de permiso requerido.",
      "Solicitar aprobación del dueño de la información.",
      "Registrar requerimiento con vigencia del acceso.",
    ],
    escalationCriteria: [
      "No existe responsable definido.",
      "El acceso incluye información sensible.",
      "La solicitud requiere aprobación de seguridad.",
    ],
    tags: ["carpeta", "share", "permisos", "acceso", "archivo"],
  },
  {
    id: "kb-account-locked",
    title: "Cuenta bloqueada o contraseña expirada",
    category: "Identidad y accesos",
    intent: "ACCESS_REQUEST",
    symptoms: ["Cuenta bloqueada", "Contraseña expirada", "No puede iniciar sesión"],
    resolutionSteps: [
      "Confirmar si el usuario puede ingresar al portal de identidad corporativa.",
      "Validar si aparece mensaje de cuenta bloqueada, contraseña expirada o credenciales incorrectas.",
      "Solicitar desbloqueo o reset mediante el flujo autorizado de identidad.",
      "Cerrar sesiones antiguas y reintentar acceso después del cambio.",
    ],
    escalationCriteria: [
      "La cuenta figura deshabilitada o sin licencia asignada.",
      "El usuario no recibe correos o avisos de recuperación.",
      "Existe sospecha de intento de acceso no autorizado.",
    ],
    tags: ["cuenta bloqueada", "bloqueada", "contraseña", "contrasena", "clave expirada", "login", "sesion"],
  },
  {
    id: "kb-mfa-reset",
    title: "Problemas con MFA o doble factor",
    category: "Identidad y accesos",
    intent: "ACCESS_REQUEST",
    symptoms: ["No llega código MFA", "Cambio de teléfono", "Aplicación autenticadora no funciona"],
    resolutionSteps: [
      "Confirmar si el usuario conserva acceso al teléfono o método MFA registrado.",
      "Validar si el problema ocurre con notificación push, código temporal o SMS.",
      "Indicar reintento desde una red estable y con hora del teléfono sincronizada.",
      "Escalar solicitud de restablecimiento MFA con validación de identidad si perdió el método.",
    ],
    escalationCriteria: [
      "El usuario perdió el dispositivo MFA.",
      "El método MFA aparece bloqueado o no registrado.",
      "El acceso corresponde a sistemas críticos o cuentas privilegiadas.",
    ],
    tags: ["mfa", "doble factor", "autenticador", "authenticator", "codigo", "código", "telefono", "teléfono"],
  },
  {
    id: "kb-outlook-send-receive",
    title: "Outlook no envía o no recibe correos",
    category: "Correo y colaboración",
    intent: "INCIDENT",
    symptoms: ["No llegan correos", "Correo queda en bandeja de salida", "Outlook sin sincronizar"],
    resolutionSteps: [
      "Confirmar si el correo funciona desde webmail para aislar Outlook local versus servicio.",
      "Validar conexión a internet y estado de VPN si usa recursos internos.",
      "Revisar si Outlook muestra trabajando sin conexión o errores de sincronización.",
      "Reiniciar Outlook y volver a probar envío a un destinatario interno.",
    ],
    escalationCriteria: [
      "El webmail también falla.",
      "Hay error de cuota, licencia o buzón bloqueado.",
      "Afecta a varios usuarios o casillas compartidas críticas.",
    ],
    tags: ["outlook", "correo", "mail", "no envia", "no envía", "no recibe", "bandeja de salida", "sincronizacion", "sincronización"],
  },
  {
    id: "kb-outlook-profile",
    title: "Outlook no abre o perfil dañado",
    category: "Correo y colaboración",
    intent: "INCIDENT",
    symptoms: ["Outlook no abre", "Perfil de Outlook dañado", "Outlook queda cargando"],
    resolutionSteps: [
      "Confirmar si Outlook muestra error de perfil, archivo de datos o queda cargando.",
      "Probar acceso por webmail para asegurar continuidad operativa.",
      "Reiniciar el equipo si Outlook quedó con procesos activos.",
      "Escalar recreación de perfil si el error persiste o impide operar.",
    ],
    escalationCriteria: [
      "El perfil no carga después de reinicio.",
      "Hay corrupción de archivo de datos o buzón compartido crítico.",
      "El usuario no tiene alternativa por webmail.",
    ],
    tags: ["outlook no abre", "perfil outlook", "ost", "pst", "queda cargando", "correo no abre"],
  },
  {
    id: "kb-teams-audio-video",
    title: "Teams con problemas de audio, cámara o micrófono",
    category: "Colaboración Microsoft 365",
    intent: "INCIDENT",
    symptoms: ["No funciona micrófono", "No funciona cámara", "No se escucha en Teams"],
    resolutionSteps: [
      "Confirmar si el problema ocurre solo en Teams o también en otras aplicaciones.",
      "Validar dispositivo seleccionado para micrófono, cámara y parlantes dentro de Teams.",
      "Revisar permisos de cámara y micrófono del sistema operativo.",
      "Probar llamada de prueba o reunión interna para confirmar resultado.",
    ],
    escalationCriteria: [
      "El dispositivo no aparece en ninguna aplicación.",
      "La falla afecta reuniones críticas o ejecutivas.",
      "Persiste después de validar permisos y dispositivo seleccionado.",
    ],
    tags: ["teams", "microfono", "micrófono", "camara", "cámara", "audio", "parlantes", "no escucha", "reunion", "reunión"],
  },
  {
    id: "kb-teams-signin",
    title: "Teams no inicia sesión o no carga",
    category: "Colaboración Microsoft 365",
    intent: "INCIDENT",
    symptoms: ["Teams no abre", "Teams no inicia sesión", "Teams queda cargando"],
    resolutionSteps: [
      "Confirmar si Teams web funciona para mantener continuidad.",
      "Validar que la cuenta corporativa pueda iniciar sesión en otros servicios Microsoft 365.",
      "Cerrar Teams completamente y volver a abrir la aplicación.",
      "Registrar mensaje de error si persiste al iniciar sesión.",
    ],
    escalationCriteria: [
      "También falla Teams web.",
      "El usuario no puede iniciar sesión en ningún servicio Microsoft 365.",
      "La falla afecta reuniones críticas o varios usuarios.",
    ],
    tags: ["teams no abre", "teams no carga", "teams login", "teams sesión", "teams sesion", "microsoft teams"],
  },
  {
    id: "kb-onedrive-sync",
    title: "OneDrive no sincroniza archivos",
    category: "Archivos y colaboración",
    intent: "INCIDENT",
    symptoms: ["OneDrive no sincroniza", "Archivo queda pendiente", "Conflicto de sincronización"],
    resolutionSteps: [
      "Confirmar si el archivo abre desde OneDrive web o SharePoint.",
      "Validar estado del icono de OneDrive y si muestra error de cuenta o espacio.",
      "Revisar nombre, ruta larga o caracteres no permitidos en el archivo.",
      "Pausar y reanudar sincronización si el cliente está conectado.",
    ],
    escalationCriteria: [
      "Hay pérdida de archivos o versiones críticas.",
      "El cliente no inicia sesión o muestra error de cuenta.",
      "El problema afecta bibliotecas compartidas de un equipo completo.",
    ],
    tags: ["onedrive", "sincroniza", "sincronización", "sync", "archivo pendiente", "conflicto", "sharepoint"],
  },
  {
    id: "kb-sharepoint-access",
    title: "Acceso a SharePoint o sitio de equipo",
    category: "Archivos y permisos",
    intent: "ACCESS_REQUEST",
    symptoms: ["Sin acceso a SharePoint", "Permiso denegado en sitio", "No ve biblioteca"],
    resolutionSteps: [
      "Identificar URL del sitio, biblioteca o carpeta solicitada.",
      "Confirmar nivel de permiso requerido: lectura, edición o propietario.",
      "Validar aprobación del responsable del sitio o dueño de la información.",
      "Registrar vigencia y justificación del acceso.",
    ],
    escalationCriteria: [
      "El sitio contiene información sensible o regulada.",
      "No existe responsable definido del recurso.",
      "El acceso requiere permisos de propietario o administración.",
    ],
    tags: ["sharepoint", "sitio", "biblioteca", "permiso denegado", "no ve carpeta", "acceso archivo"],
  },
  {
    id: "kb-wifi-corporate",
    title: "Problemas de Wi-Fi corporativo",
    category: "Redes y conectividad",
    intent: "NETWORK_ISSUE",
    symptoms: ["No conecta a Wi-Fi", "Wi-Fi lento", "Se desconecta de la red"],
    resolutionSteps: [
      "Confirmar si otros usuarios en la misma ubicación tienen conectividad.",
      "Validar que el equipo esté conectado a la red corporativa correcta.",
      "Olvidar y reconectar la red si la política corporativa lo permite.",
      "Probar conexión por cable o red alternativa para aislar equipo versus red.",
    ],
    escalationCriteria: [
      "Afecta a múltiples usuarios o un área completa.",
      "El equipo no detecta ninguna red Wi-Fi.",
      "La desconexión impide operación crítica.",
    ],
    tags: ["wifi", "wi-fi", "inalambrica", "inalámbrica", "red lenta", "no conecta", "se desconecta"],
  },
  {
    id: "kb-lan-no-network",
    title: "Sin red por cable",
    category: "Redes y conectividad",
    intent: "NETWORK_ISSUE",
    symptoms: ["Cable de red sin conexión", "No obtiene IP", "Sin acceso a red cableada"],
    resolutionSteps: [
      "Confirmar si el cable de red está firmemente conectado al equipo o dock.",
      "Validar luces del puerto de red si están visibles.",
      "Probar otro cable o punto de red si está disponible.",
      "Comparar con otro equipo en el mismo punto para aislar boca de red versus equipo.",
    ],
    escalationCriteria: [
      "El punto de red no funciona con ningún equipo.",
      "El adaptador de red no aparece en el sistema.",
      "Afecta a un puesto crítico o varios puestos del área.",
    ],
    tags: ["cable red", "ethernet", "lan", "sin red", "no obtiene ip", "dock", "punto de red"],
  },
  {
    id: "kb-internet-slow",
    title: "Internet lento o intermitente",
    category: "Redes y conectividad",
    intent: "NETWORK_ISSUE",
    symptoms: ["Internet lento", "Conexión intermitente", "Páginas demoran en cargar"],
    resolutionSteps: [
      "Confirmar si la lentitud ocurre en todos los sitios o solo en un sistema específico.",
      "Validar si el usuario está conectado por VPN, Wi-Fi o cable.",
      "Probar navegación a un sitio corporativo y a uno externo permitido.",
      "Registrar ubicación, tipo de conexión y hora de inicio.",
    ],
    escalationCriteria: [
      "Afecta a varios usuarios en la misma sede.",
      "Hay pérdida total de conectividad.",
      "Impacta operación crítica o atención a clientes.",
    ],
    tags: ["internet lento", "lento", "intermitente", "latencia", "navegacion", "navegación", "pagina lenta", "página lenta"],
  },
  {
    id: "kb-printer-not-printing",
    title: "Impresora no imprime",
    category: "Impresión",
    intent: "HARDWARE_ISSUE",
    symptoms: ["Impresora no imprime", "Documento queda en cola", "No aparece impresora"],
    resolutionSteps: [
      "Confirmar nombre o ubicación de la impresora afectada.",
      "Validar si otros usuarios pueden imprimir en la misma impresora.",
      "Revisar si el trabajo quedó detenido en cola de impresión.",
      "Probar impresión de una página simple o desde otra aplicación.",
    ],
    escalationCriteria: [
      "La impresora no responde para ningún usuario.",
      "Hay error físico, atasco o falta de insumos.",
      "La impresión es crítica para operación de sucursal o bodega.",
    ],
    tags: ["impresora", "imprimir", "cola", "no imprime", "printer", "no aparece impresora"],
  },
  {
    id: "kb-printer-paper-toner",
    title: "Atasco, tóner o papel en impresora",
    category: "Impresión",
    intent: "HARDWARE_ISSUE",
    symptoms: ["Atasco de papel", "Sin tóner", "Impresora con error físico"],
    resolutionSteps: [
      "Identificar el mensaje exacto en el panel de la impresora.",
      "Confirmar si hay papel atascado, bandeja vacía o tóner agotado.",
      "Evitar forzar piezas internas; retirar solo papel visible y accesible.",
      "Registrar modelo, ubicación y consumible requerido si corresponde.",
    ],
    escalationCriteria: [
      "El atasco no se puede retirar de forma segura.",
      "Falta tóner, tambor u otro consumible administrado.",
      "El equipo muestra error de mantenimiento.",
    ],
    tags: ["atasco", "papel", "toner", "tóner", "tambor", "bandeja", "error impresora"],
  },
  {
    id: "kb-scanner-issue",
    title: "Escáner no funciona",
    category: "Impresión y digitalización",
    intent: "HARDWARE_ISSUE",
    symptoms: ["Escáner no responde", "No puede digitalizar", "Error al escanear"],
    resolutionSteps: [
      "Confirmar si la impresora multifuncional imprime aunque no escanee.",
      "Validar si el escaneo falla a correo, carpeta o aplicación local.",
      "Revisar mensaje de error y destino configurado.",
      "Probar escaneo simple desde el panel del equipo si está disponible.",
    ],
    escalationCriteria: [
      "El destino de escaneo requiere permisos o credenciales administradas.",
      "El equipo no responde para ningún usuario.",
      "El escaneo es parte de un proceso operativo crítico.",
    ],
    tags: ["scanner", "escanner", "escáner", "escaner", "digitalizar", "escanear", "multifuncional"],
  },
  {
    id: "kb-laptop-no-power",
    title: "Notebook no enciende",
    category: "Puesto de trabajo",
    intent: "HARDWARE_ISSUE",
    symptoms: ["Notebook no enciende", "Equipo sin energía", "No carga"],
    resolutionSteps: [
      "Confirmar si enciende alguna luz del cargador, equipo o dock.",
      "Probar otro enchufe y revisar que el cargador esté firme en ambos extremos.",
      "Desconectar periféricos y mantener presionado encendido unos segundos antes de reintentar.",
      "Registrar modelo, activo y estado de luces o sonido al intentar encender.",
    ],
    escalationCriteria: [
      "No hay luces ni señal de energía con cargador conectado.",
      "El cargador presenta daño físico o sobrecalentamiento.",
      "El usuario queda sin equipo alternativo para operar.",
    ],
    tags: ["no enciende", "sin energia", "sin energía", "cargador", "bateria", "batería", "notebook muerto", "no carga"],
  },
  {
    id: "kb-battery-charger",
    title: "Batería o cargador con falla",
    category: "Puesto de trabajo",
    intent: "HARDWARE_ISSUE",
    symptoms: ["Batería no carga", "Cargador no funciona", "Equipo se apaga"],
    resolutionSteps: [
      "Confirmar porcentaje de batería y si el sistema indica conectado sin cargar.",
      "Validar si el cargador tiene daño visible o falso contacto.",
      "Probar otro cargador compatible si está disponible.",
      "Registrar activo del equipo y cargador para evaluación o reemplazo.",
    ],
    escalationCriteria: [
      "La batería está inflada, caliente o con daño visible.",
      "El equipo se apaga incluso conectado.",
      "No hay cargador alternativo y el usuario no puede operar.",
    ],
    tags: ["bateria", "batería", "cargador", "no carga", "se apaga", "enchufado", "conectado sin cargar"],
  },
  {
    id: "kb-camera-microphone-system",
    title: "Cámara o micrófono no detectado por el equipo",
    category: "Puesto de trabajo",
    intent: "HARDWARE_ISSUE",
    symptoms: ["Cámara no detectada", "Micrófono no detectado", "No aparece dispositivo de audio"],
    resolutionSteps: [
      "Confirmar si el dispositivo falla en todas las aplicaciones o solo en una.",
      "Validar permisos de cámara y micrófono del sistema operativo.",
      "Revisar si hay tecla física, tapa de privacidad o switch que bloquee cámara o micrófono.",
      "Probar reinicio del equipo y registrar si el dispositivo aparece después.",
    ],
    escalationCriteria: [
      "El dispositivo no aparece en el sistema después de reinicio.",
      "Hay daño físico visible o bloqueo mecánico.",
      "La falla impide reuniones críticas.",
    ],
    tags: ["camara", "cámara", "microfono", "micrófono", "audio", "no detecta", "webcam", "dispositivo audio"],
  },
  {
    id: "kb-bitlocker-recovery",
    title: "Equipo solicita clave BitLocker",
    category: "Seguridad de endpoint",
    intent: "SECURITY_INCIDENT",
    symptoms: ["Pide clave BitLocker", "Pantalla azul de recuperación", "Recovery key"],
    resolutionSteps: [
      "Confirmar activo del equipo y usuario asignado antes de cualquier acción.",
      "No compartir claves por canales no autorizados.",
      "Validar identidad del usuario y motivo del bloqueo.",
      "Derivar recuperación por el procedimiento formal de seguridad o soporte endpoint.",
    ],
    escalationCriteria: [
      "No coincide usuario, activo o inventario.",
      "El equipo tuvo cambios de hardware, BIOS o arranque sospechosos.",
      "Hay riesgo de exposición de datos.",
    ],
    tags: ["bitlocker", "recovery key", "clave recuperacion", "clave recuperación", "pantalla azul recuperación"],
  },
  {
    id: "kb-windows-update-loop",
    title: "Windows queda actualizando o reiniciando",
    category: "Endpoint Windows",
    intent: "INCIDENT",
    symptoms: ["Windows queda actualizando", "Reinicio en bucle", "Actualización fallida"],
    resolutionSteps: [
      "Confirmar cuánto tiempo lleva el equipo en actualización o reinicio.",
      "Si muestra progreso, esperar sin apagar mientras avance normalmente.",
      "Registrar porcentaje, mensaje en pantalla y si el equipo tiene energía conectada.",
      "Escalar si el proceso queda detenido o entra en ciclo repetitivo.",
    ],
    escalationCriteria: [
      "Permanece detenido sin avance por un periodo prolongado.",
      "Entra en reinicio repetitivo.",
      "El equipo contiene trabajo crítico sin respaldo reciente.",
    ],
    tags: ["windows update", "actualizando", "reinicio", "bucle", "actualizacion", "actualización", "parche"],
  },
  {
    id: "kb-blue-screen",
    title: "Pantalla azul o error crítico de Windows",
    category: "Endpoint Windows",
    intent: "INCIDENT",
    symptoms: ["Pantalla azul", "Error crítico", "Windows se reinicia solo"],
    resolutionSteps: [
      "Registrar el código de error mostrado en pantalla si es visible.",
      "Confirmar si ocurrió una vez o se repite al iniciar.",
      "Desconectar periféricos recientes y reiniciar una vez si no hay trabajo en curso.",
      "Escalar con hora, código de error y cambios recientes de software o hardware.",
    ],
    escalationCriteria: [
      "El equipo no inicia después del error.",
      "La pantalla azul se repite.",
      "Hay pérdida de datos o impacto operativo crítico.",
    ],
    tags: ["pantalla azul", "bsod", "error critico", "error crítico", "windows se reinicia", "crash"],
  },
  {
    id: "kb-windows-taskbar-missing",
    title: "Barra de tareas o menú Inicio no aparece",
    category: "Endpoint Windows",
    intent: "INCIDENT",
    symptoms: ["Barra de tareas no aparece", "Menú Inicio no responde", "No se ve la barra inferior"],
    resolutionSteps: [
      "Confirmar si la barra inferior está oculta, congelada o si tampoco responde el menú Inicio.",
      "Presionar la tecla Windows para validar si aparece el menú Inicio.",
      "Reiniciar el Explorador de Windows o cerrar sesión si la barra quedó congelada.",
      "Reiniciar el equipo si el escritorio no responde o el problema persiste.",
    ],
    escalationCriteria: [
      "La barra no vuelve después de reiniciar sesión o equipo.",
      "El escritorio queda completamente bloqueado.",
      "El usuario no puede acceder a aplicaciones necesarias para trabajar.",
    ],
    tags: ["barra de abajo", "barra inferior", "barra de tareas", "taskbar", "menu inicio", "menú inicio", "explorador", "explorador de windows", "reiniciar explorador", "escritorio"],
  },
  {
    id: "kb-browser-site-error",
    title: "Navegador o sitio corporativo con error",
    category: "Aplicaciones web",
    intent: "INCIDENT",
    symptoms: ["Página no carga", "Error en navegador", "Sitio corporativo no abre"],
    resolutionSteps: [
      "Confirmar URL exacta y navegador usado.",
      "Validar si el sitio abre en otro navegador corporativo permitido.",
      "Revisar si el error ocurre dentro o fuera de VPN.",
      "Registrar mensaje o código de error visible.",
    ],
    escalationCriteria: [
      "El sitio falla para varios usuarios.",
      "El error corresponde a certificado, permisos o indisponibilidad del servicio.",
      "Afecta un proceso productivo crítico.",
    ],
    tags: ["chrome", "edge", "navegador", "pagina", "página", "sitio", "url", "certificado", "error 404", "error 500"],
  },
  {
    id: "kb-certificate-signature",
    title: "Certificado digital o firma electrónica",
    category: "Identidad digital",
    intent: "ACCESS_REQUEST",
    symptoms: ["Firma electrónica no funciona", "Certificado vencido", "No reconoce certificado"],
    resolutionSteps: [
      "Confirmar aplicación, portal o trámite donde se usa la firma.",
      "Validar vigencia del certificado y titular asociado.",
      "Revisar si el navegador o aplicación reconoce el certificado instalado.",
      "Escalar renovación, reinstalación o validación con proveedor autorizado si corresponde.",
    ],
    escalationCriteria: [
      "El certificado está vencido o revocado.",
      "El certificado pertenece a otro titular.",
      "La firma impacta obligaciones legales o regulatorias.",
    ],
    tags: ["firma", "firma electronica", "firma electrónica", "certificado", "token", "efirma", "e-firma"],
  },
  {
    id: "kb-erp-sap-unavailable",
    title: "ERP o SAP no disponible",
    category: "Aplicaciones corporativas",
    intent: "INCIDENT",
    symptoms: ["SAP caído", "ERP no disponible", "Sistema corporativo no responde"],
    resolutionSteps: [
      "Confirmar sistema, módulo o transacción afectada.",
      "Validar alcance: solo usuario, área completa o múltiples sedes.",
      "Registrar hora de inicio y mensaje de error.",
      "Verificar si existe workaround operativo aprobado.",
    ],
    escalationCriteria: [
      "Afecta cierre contable, facturación, logística o atención a clientes.",
      "Afecta a múltiples usuarios o áreas.",
      "No existe workaround disponible.",
    ],
    tags: ["sap", "erp", "transaccion", "transacción", "modulo", "módulo", "facturacion", "facturación", "sistema caido", "sistema caído"],
  },
  {
    id: "kb-business-app-access",
    title: "Acceso a aplicación corporativa",
    category: "Aplicaciones corporativas",
    intent: "ACCESS_REQUEST",
    symptoms: ["Necesita acceso a sistema", "Usuario sin perfil", "Permisos insuficientes"],
    resolutionSteps: [
      "Identificar aplicación, perfil o rol solicitado.",
      "Confirmar responsable aprobador y justificación de negocio.",
      "Validar si el acceso es temporal o permanente.",
      "Registrar solicitud con área, usuario y alcance exacto del permiso.",
    ],
    escalationCriteria: [
      "El rol permite aprobar pagos, datos sensibles o administración.",
      "No existe aprobador claro.",
      "La solicitud requiere segregación de funciones o control de auditoría.",
    ],
    tags: ["perfil", "rol", "permiso sistema", "acceso sistema", "aplicacion corporativa", "aplicación corporativa", "usuario"],
  },
  {
    id: "kb-phishing-report",
    title: "Reporte de correo sospechoso o phishing",
    category: "Seguridad de la información",
    intent: "SECURITY_INCIDENT",
    symptoms: ["Correo sospechoso", "Phishing", "Enlace malicioso"],
    resolutionSteps: [
      "Indicar al usuario que no abra enlaces ni descargue adjuntos.",
      "Confirmar si hizo clic, ingresó credenciales o descargó archivos.",
      "Preservar el correo para análisis sin reenviarlo a listas masivas.",
      "Escalar a seguridad con remitente, asunto, hora y acción realizada.",
    ],
    escalationCriteria: [
      "El usuario ingresó credenciales o descargó adjuntos.",
      "El correo llegó a múltiples usuarios.",
      "El mensaje suplanta proveedores, bancos, directivos o servicios internos.",
    ],
    tags: ["phishing", "correo sospechoso", "malicioso", "enlace", "adjunto", "suplantacion", "suplantación"],
  },
  {
    id: "kb-malware-suspicion",
    title: "Sospecha de malware o equipo comprometido",
    category: "Seguridad de endpoint",
    intent: "SECURITY_INCIDENT",
    symptoms: ["Equipo con malware", "Ventanas extrañas", "Antivirus alerta"],
    resolutionSteps: [
      "Indicar al usuario que no apague ni manipule archivos sospechosos salvo instrucción de seguridad.",
      "Confirmar alerta exacta, hora y acción realizada.",
      "Desconectar de redes no indispensables si seguridad lo solicita o si hay actividad activa evidente.",
      "Escalar a seguridad TI con evidencias y activo afectado.",
    ],
    escalationCriteria: [
      "Antivirus detecta amenaza activa.",
      "Hay cifrado, robo de credenciales o comportamiento anómalo.",
      "El equipo maneja información sensible o privilegiada.",
    ],
    tags: ["malware", "virus", "antivirus", "ransomware", "alerta seguridad", "equipo comprometido", "ventanas extrañas"],
  },
  {
    id: "kb-deleted-file-restore",
    title: "Recuperación de archivo eliminado o versión anterior",
    category: "Archivos y respaldo",
    intent: "SERVICE_REQUEST",
    symptoms: ["Archivo eliminado", "Necesita recuperar archivo", "Versión anterior"],
    resolutionSteps: [
      "Identificar ubicación original del archivo y nombre aproximado.",
      "Confirmar fecha y hora estimada de eliminación o modificación.",
      "Validar si estaba en OneDrive, SharePoint, carpeta compartida o equipo local.",
      "Revisar papelera o versiones anteriores cuando el repositorio lo permita.",
    ],
    escalationCriteria: [
      "El archivo no aparece en papelera ni versiones.",
      "Contiene información crítica o regulada.",
      "La pérdida afecta continuidad operativa.",
    ],
    tags: ["archivo eliminado", "recuperar archivo", "restaurar", "version anterior", "versión anterior", "papelera", "backup", "respaldo"],
  },
  {
    id: "kb-softphone-telephony",
    title: "Telefonía o softphone no funciona",
    category: "Comunicaciones",
    intent: "INCIDENT",
    symptoms: ["No puede llamar", "Softphone sin audio", "Teléfono IP no registra"],
    resolutionSteps: [
      "Confirmar si falla llamar, recibir llamadas o ambos.",
      "Validar conexión de red y audio del equipo o teléfono.",
      "Reiniciar la aplicación softphone o el teléfono IP si corresponde.",
      "Registrar extensión, ubicación y mensaje de error.",
    ],
    escalationCriteria: [
      "Afecta mesa de atención, call center o recepción.",
      "Falla para múltiples extensiones.",
      "El teléfono no registra en la central.",
    ],
    tags: ["telefono", "teléfono", "softphone", "extension", "extensión", "llamadas", "voip", "call center"],
  },
  {
    id: "kb-software-license",
    title: "Solicitud o falla de licencia de software",
    category: "Software corporativo",
    intent: "SOFTWARE_REQUEST",
    symptoms: ["Licencia vencida", "Software sin licencia", "Necesita licencia"],
    resolutionSteps: [
      "Identificar software, versión y usuario que requiere la licencia.",
      "Confirmar justificación de negocio y aprobación del responsable.",
      "Validar si existe licencia disponible o si requiere compra.",
      "Registrar vigencia requerida y equipo donde se usará.",
    ],
    escalationCriteria: [
      "No hay licencias disponibles.",
      "Requiere compra, renovación o excepción de seguridad.",
      "El software impacta operación crítica.",
    ],
    tags: ["licencia", "licencia vencida", "activar", "activacion", "activación", "software pago", "suscripcion", "suscripción"],
  },
  {
    id: "kb-app-blocked-security",
    title: "Aplicación bloqueada por seguridad",
    category: "Seguridad de endpoint",
    intent: "SECURITY_INCIDENT",
    symptoms: ["Aplicación bloqueada", "Antivirus bloquea programa", "Control de aplicaciones impide ejecutar"],
    resolutionSteps: [
      "Confirmar nombre del ejecutable, origen del instalador y mensaje de bloqueo.",
      "No indicar desactivar antivirus ni controles corporativos.",
      "Validar si el software está en catálogo autorizado.",
      "Escalar evaluación de excepción con justificación de negocio.",
    ],
    escalationCriteria: [
      "El ejecutable no proviene de fuente confiable.",
      "Requiere permisos administrativos o excepción de seguridad.",
      "El bloqueo afecta operación crítica aprobada.",
    ],
    tags: ["bloqueado", "antivirus bloquea", "control aplicaciones", "ejecutable", "no permite instalar", "app bloqueada"],
  },
  {
    id: "kb-critical-app",
    title: "Incidente crítico de aplicación corporativa",
    category: "Aplicaciones corporativas",
    intent: "INCIDENT",
    symptoms: ["Aplicación caída", "Servicio crítico indisponible", "Impacto masivo"],
    resolutionSteps: [
      "Confirmar alcance: usuario único, área completa o múltiples sedes.",
      "Registrar hora de inicio y mensaje de error.",
      "Validar si existe workaround operativo aprobado.",
      "Escalar a equipo resolutor con prioridad alta o crítica.",
    ],
    escalationCriteria: [
      "Afecta proceso crítico de negocio.",
      "Afecta múltiples usuarios o áreas.",
      "No existe workaround disponible.",
    ],
    tags: ["crítica", "aplicación", "caída", "erp", "indisponible", "producción"],
  },
];

export function findKnowledgeMatches(message: string, intent?: ITSMIntent) {
  const normalizedMessage = normalizeSearchText(message);
  const preferredArticleId = resolvePreferredArticleId(normalizedMessage);

  return knowledgeBase
    .map((article) => {
      const tagScore = article.tags.filter((tag) => normalizedMessage.includes(normalizeSearchText(tag))).length * 2;
      const symptomScore = article.symptoms.filter((symptom) =>
        normalizedMessage.includes(normalizeSearchText(symptom)),
      ).length;
      const contentScore = tagScore + symptomScore;
      const intentScore = contentScore > 0 && intent && article.intent === intent ? 3 : 0;
      const preferredScore = preferredArticleId === article.id ? 8 : 0;

      return { article, contentScore: contentScore + preferredScore, score: intentScore + contentScore + preferredScore };
    })
    .filter(({ contentScore }) => contentScore > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ article }) => article);
}

export function findKnowledgeArticleById(id: string | undefined) {
  if (!id) return undefined;
  return knowledgeBase.find((article) => article.id === id);
}

function resolvePreferredArticleId(normalizedMessage: string) {
  if (
    hasAnySearchText(normalizedMessage, ["correo", "mail", "outlook"]) &&
    hasAnySearchText(normalizedMessage, ["no salen", "no envia", "no envía", "no llegan", "no recibe", "bandeja de salida", "sincroniza"])
  ) {
    return "kb-outlook-send-receive";
  }

  return undefined;
}

function hasAnySearchText(value: string, terms: string[]) {
  return terms.some((term) => value.includes(normalizeSearchText(term)));
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
