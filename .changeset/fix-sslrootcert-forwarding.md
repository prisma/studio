---
"@prisma/studio-core": patch
---

# Support libpq SSL parameters in Postgres connection strings

Consume `sslrootcert`, `sslcert`, `sslkey`, `sslpassword`, and `sslmode` client-side when building the postgres.js client instead of forwarding them to the server, which rejected connections with `unrecognized configuration parameter "sslrootcert"`. The new `createPostgresJSConnectionConfig` helper in `@prisma/studio-core/data/postgresjs` translates a connection string into a stripped connection string plus TLS options (reading certificate files from disk) for `postgres()`.
