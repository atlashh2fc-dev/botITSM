# Aislamiento multitenant

El tenant se resuelve exclusivamente desde el hostname de cada solicitud:

| Dominio | Tenant |
| --- | --- |
| `iabot.geimser.cl` | `geimser` |
| `iabot.mda.demoitsm.cl` | `forum` |

Nunca se acepta un tenant desde un query string, cookie o cuerpo de la petición.

## Invariantes

- Toda lectura y escritura persistente incluye `tenant_id`.
- Las credenciales de Zammad se resuelven por tenant. Forum nunca usa las variables heredadas de Geimser.
- La aplicación solo accede a Supabase desde el servidor con `SUPABASE_SERVICE_ROLE_KEY`.
- Las tablas del bot mantienen RLS activo y no entregan permisos a `anon` ni `authenticated`; las rutas API aplican el filtro de tenant.
- Los datos heredados se asignan a `geimser` durante la migración. No se eliminan registros.

## Despliegue seguro

1. Definir en Vercel, para **Production**, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, los hosts de tenant y las credenciales Zammad específicas de cada tenant.
2. Ejecutar `20260804000000_multitenancy.sql` en `supabase-crimson-village`.
3. Verificar que no existan `tenant_id` nulos y que ambos tenants puedan crear una conversación de prueba.
4. Desplegar la rama que contiene el código tenant-aware.
5. Confirmar que los dashboards no devuelven datos del otro dominio.

## Operación

- Rotar inmediatamente una credencial si se llega a mostrar en una consola, captura o log.
- No usar `NEXT_PUBLIC_*` para claves de servidor.
- Antes de sumar un nuevo tenant, crear sus credenciales y dominio, agregarlo al resolver del servidor y registrar su fila en `public.itsm_tenants`.
