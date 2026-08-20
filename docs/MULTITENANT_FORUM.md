# Despliegue multi-tenant: Geimser y Forum

El tenant se determina exclusivamente por el hostname recibido por el servidor.

- Geimser: iabot.geimser.cl -> https://itsm.geimser.cl
- Forum: iabot.demoitsm.cl -> https://mda.demoitsm.cl

## Variables de Vercel

Configurar en Production, sin prefijo NEXT_PUBLIC_:

    TENANT_GEIMSER_HOSTS=iabot.geimser.cl
    TENANT_FORUM_HOSTS=iabot.demoitsm.cl
    ITSM_BOT_GEIMSER_SESSION_SECRET=<secreto aleatorio distinto de al menos 32 caracteres>
    ITSM_BOT_FORUM_SESSION_SECRET=<secreto aleatorio distinto de al menos 32 caracteres>
    ZAMMAD_GEIMSER_BASE_URL=https://itsm.geimser.cl
    ZAMMAD_GEIMSER_API_TOKEN=<token-geimser>
    ZAMMAD_GEIMSER_GROUP=Users
    ZAMMAD_GEIMSER_GROUPS=Users
    ZAMMAD_GEIMSER_ASSET_GROUPS=<grupos CMDB Geimser separados por coma>
    ZAMMAD_FORUM_BASE_URL=https://mda.demoitsm.cl
    ZAMMAD_FORUM_API_TOKEN=<token-forum>
    ZAMMAD_FORUM_GROUP=TI Forum
    ZAMMAD_FORUM_GROUPS=TI Forum
    ZAMMAD_FORUM_ASSET_GROUPS=<grupos CMDB Forum separados por coma>

El token Forum debe ser nuevo y emitido en mda.demoitsm.cl; no reutilizar el
token de Geimser. Conservar también las variables actuales de Supabase y del modelo
LLM como secretos de servidor.

`ITSM_BOT_*_SESSION_SECRET` debe tener el mismo valor en Vercel y en el
contenedor Zammad que emite la assertion. El valor nunca lleva prefijo
`NEXT_PUBLIC_`. Las allowlists `*_GROUPS` y `*_ASSET_GROUPS` son obligatorias:
una lista vacía de activos devuelve cero resultados, no datos compartidos.

## Orden seguro

1. Respaldar Supabase y ejecutar 20260804000000_multitenancy.sql.
2. Desplegar el código en una rama o preview de Vercel con las variables anteriores.
3. Añadir iabot.demoitsm.cl al proyecto Vercel.
4. En el DNS cPanel de geimser.cl, crear el CNAME que Vercel indique para
   iabot.atlasitsm.
5. Verificar creación y consulta de un ticket Forum y confirmar que no aparece en
   iabot.geimser.cl.

No se debe cambiar ZAMMAD_GEIMSER_* al habilitar Forum.
