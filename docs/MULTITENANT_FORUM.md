# Despliegue multi-tenant: Geimser y Forum

El tenant se determina exclusivamente por el hostname recibido por el servidor.

- Geimser: iabot.geimser.cl -> https://itsm.geimser.cl
- Forum: iabot.atlasitsm.geimser.cl -> https://atlasitsm.geimser.cl

## Variables de Vercel

Configurar en Production, sin prefijo NEXT_PUBLIC_:

    TENANT_GEIMSER_HOSTS=iabot.geimser.cl
    TENANT_FORUM_HOSTS=iabot.atlasitsm.geimser.cl
    ZAMMAD_GEIMSER_BASE_URL=https://itsm.geimser.cl
    ZAMMAD_GEIMSER_API_TOKEN=<token-geimser>
    ZAMMAD_GEIMSER_GROUP=Users
    ZAMMAD_FORUM_BASE_URL=https://atlasitsm.geimser.cl
    ZAMMAD_FORUM_API_TOKEN=<token-forum>
    ZAMMAD_FORUM_GROUP=Users

El token Forum debe ser nuevo y emitido en atlasitsm.geimser.cl; no reutilizar el
token de Geimser. Conservar también las variables actuales de Supabase y del modelo
LLM como secretos de servidor.

## Orden seguro

1. Respaldar Supabase y ejecutar 20260804000000_multitenancy.sql.
2. Desplegar el código en una rama o preview de Vercel con las variables anteriores.
3. Añadir iabot.atlasitsm.geimser.cl al proyecto Vercel.
4. En el DNS cPanel de geimser.cl, crear el CNAME que Vercel indique para
   iabot.atlasitsm.
5. Verificar creación y consulta de un ticket Forum y confirmar que no aparece en
   iabot.geimser.cl.

No se debe cambiar ZAMMAD_GEIMSER_* al habilitar Forum.
