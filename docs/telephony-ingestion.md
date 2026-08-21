# Ingesta telefónica Asterisk

La ingesta permanece apagada por defecto. `TELEPHONY_<TENANT>_INGEST_ENABLED`
debe seguir en `false` hasta validar el bridge y las cuatro allowlists exactas en
el PBX real. Un DID no demuestra que la llamada sea entrante: campañas salientes
pueden presentar el mismo número.

## Contrato firmado v2

Cada evento debe enviar el leg raíz entrante y conservar la misma evidencia en
`newCall`, `answer` y `hangup`:

```json
{
  "version": 2,
  "source": "asterisk-ami",
  "eventId": "1712345678.10:newCall",
  "callId": "1712345678.10",
  "linkedId": "1712345678.10",
  "event": "newCall",
  "direction": "in",
  "from": "+56911112222",
  "to": "+56965906926",
  "context": "itsm-demo-inbound",
  "channel": "PJSIP/siptel-inbound-itsm-000001ab",
  "trunk": "PJSIP/siptel-inbound-itsm",
  "queue": "itsm_demo",
  "occurredAt": "2026-08-21T12:00:00.000Z"
}
```

`callId` debe ser igual a `linkedId`. El bridge firma el cuerpo JSON crudo con
`HMAC-SHA256(secret, timestamp + "." + tenant + "." + rawBody)` y envía:

- `X-Atlas-Timestamp: <unix seconds>`
- `X-Atlas-Tenant: forum|geimser`
- `X-Atlas-Signature: sha256=<hex>`

## Condiciones para una futura habilitación

Antes de cambiar el kill switch a `true`, deben existir para el tenant:

- `TELEPHONY_<TENANT>_WEBHOOK_SECRET`
- `TELEPHONY_<TENANT>_ALLOWED_DIDS`
- `TELEPHONY_<TENANT>_ALLOWED_CONTEXTS`
- `TELEPHONY_<TENANT>_ALLOWED_TRUNKS`
- `TELEPHONY_<TENANT>_ALLOWED_QUEUES`
- credenciales Zammad, fallback customer y Supabase server

Las allowlists usan coincidencia exacta, separada por comas. `trunk` también
debe ser el `channel` sin el sufijo dinámico del leg Asterisk. Cualquier campo
faltante, ruta no autorizada, dirección saliente, evidencia incoherente o
cambio de evidencia entre eventos se rechaza antes de crear tickets. También
se rechaza un caller `from` que coincida con un DID propio: es una señal de
originación saliente aunque el productor haya declarado `direction: "in"`.
Lo mismo ocurre con un evento final sin `newCall` previo.
