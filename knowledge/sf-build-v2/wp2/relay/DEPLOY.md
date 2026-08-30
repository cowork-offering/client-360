# c360-relay — the fallback door

The primary door is the org calling itself: `ExecuteLoanModification` mints an opaque UI session
through the `C360RelaySession` Visualforce page and POSTs straight back to its own Actions API.
Nothing here is involved when that works.

This service is the door the org falls through to when it cannot mint or use that session — an
outcome that is plausible under hosted MCP and cannot be assumed away, which is why it exists and
stays running rather than being written down as a plan.

## What it does

One endpoint. It verifies a shared-secret header, mints a fresh org access token, forwards the JSON
body verbatim to `POST {INSTANCE}/services/data/v61.0/actions/custom/apex/ExecuteLoanModification`,
and returns Salesforce's answer with its status. It interprets nothing. The org owns validation, the
token gate and the verification.

- `GET /healthz` — liveness, unauthenticated, reveals no configuration.
- `POST /relay` with `{"noop": true}` — signed reachability check: secret, token mint, org reachable.
- `POST /relay` with an Actions API body — the real hop.

## Install

```
/opt/connectry/c360-relay/server.ts        the service (this file, deployed)
/opt/connectry/c360-relay/.env             chmod 600, NEVER committed
~/.config/systemd/user/c360-relay.service  systemd user unit, linger is on
```

`.env` carries `C360_RELAY_PORT`, `C360_RELAY_SECRET`, `C360_SF_API_VERSION`, `C360_TOKEN_HELPER`.
The service refuses to start without a secret: an unauthenticated relay is a write door.

Caddy routes `https://bot.connectry.io/c360-relay/*` to `127.0.0.1:8461`, in the `bot.connectry.io`
block of `/etc/caddy/Caddyfile`.

## The secret

Generated with `openssl rand -hex 32` and stored in exactly two places: the `.env` file above, and
the `cm_Relay_Config__c` org-default row, inserted through the REST data API from this box. It is
in no repository and no deploy artifact. Rotating it means writing both places in one sitting; the
org row is the one Apex reads, and a mismatch shows up as a 401 in the service log.

## Two things that will bite

**Cloudflare fronts bot.connectry.io.** Its bot rules 403 some clients before the request reaches
Caddy at all — `Python-urllib` is blocked, `curl` and `SFDC-Callout/67.0` (the agent Apex sends) are
not. A 403 with no line in the service journal means the request never arrived. Test with the caller's
real user agent, not a convenient one.

**Never log the body.** It carries the single-use decision token that proves a named human confirmed
a specific plan. The service logs request id, method, path, status and duration, and that is the
whole list.
