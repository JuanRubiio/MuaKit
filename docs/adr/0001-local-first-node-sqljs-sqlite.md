# ADR-0001: App local con Node, Express, sql.js y SQLite

## Estado

Aceptada.

## Contexto

Mua Ops nace para una empresa pequena, con uso local, bajo coste operativo y
necesidad de controlar datos sin depender de nuevas suscripciones. La prioridad
era velocidad, portabilidad y persistencia simple.

## Decision

Construir Mua Ops como app local Node/Express con frontend estatico y SQLite
gestionado mediante `sql.js`.

## Consecuencias

Beneficios:

- Arranque simple con `npm start`.
- Base local facil de respaldar.
- Sin coste cloud ni servicios adicionales.
- Suficiente para uso unipersonal o equipo pequeno en esta fase.

Costes:

- No es ideal para concurrencia multiusuario fuerte.
- `server.js` ha acumulado demasiada responsabilidad.
- La persistencia con `sql.js` requiere disciplina de guardado y backups.

## Alternativas consideradas

- Shopify apps de terceros: resuelven partes, pero anaden coste y no encajan con kits/materiales propios.
- Postgres desde el inicio: mas robusto, pero excesivo para la fase local.
- Electron: mejor distribucion escritorio, pero mas superficie tecnica.

## Revisitaremos cuando

- Haya varios usuarios trabajando a la vez.
- Se quiera desplegar fuera del equipo local.
- La base crezca hasta hacer incomodo el guardado local.
