# Ycode Headless API (v1)

Read/write access to your published collections and forms over HTTP.
Base path: `/ycode/api/v1`

## Authentication

Every request needs a Bearer API key:

```
Authorization: Bearer <api_key>
```

Keys are created in the builder settings. The plain key is shown **once** at
creation — store it securely. Keys are stored server-side as SHA-256 hashes.

### Scopes

A key holds one or more scopes:

| Scope   | Grants                                  |
|---------|-----------------------------------------|
| `read`  | `GET`, `HEAD`, `OPTIONS`                 |
| `write` | `POST`, `PUT`, `PATCH`, `DELETE`         |

A request whose HTTP method is not covered by the key's scopes returns `403`.

### Lifecycle

- **expires_at** — optional. After this time the key stops working (`401`).
- **revoked_at** — set via revoke. A revoked key stops working immediately
  (`401`) but the row is kept for audit.

Missing/expired/revoked/invalid keys all return the same generic `401` so the
API doesn't leak which condition failed.

## Rate limiting

Requests are limited **per key** (falling back to client IP for
unauthenticated calls). Default: **120 requests/minute**, configurable via the
`API_RATE_LIMIT_PER_MIN` environment variable.

Over the limit returns `429` with `code: "RATE_LIMITED"` and a message stating
when to retry.

> Note: the limiter is in-memory, so on a multi-instance / serverless
> deployment the limit is enforced per instance. Use a shared store
> (Redis/Upstash) for a strictly global limit.

## Errors

Errors are JSON: `{ "error": string, "code": string }`.

| Status | Code               | Meaning                                  |
|--------|--------------------|------------------------------------------|
| 401    | `UNAUTHORIZED`     | Missing/invalid/expired/revoked key      |
| 403    | `FORBIDDEN`        | Key lacks the required scope             |
| 413    | `PAYLOAD_TOO_LARGE`| Request body exceeds the size limit      |
| 422    | `VALIDATION_ERROR` | Field validation failed (see `details`)  |
| 429    | `RATE_LIMITED`     | Too many requests                        |
| 500    | `INTERNAL_ERROR`   | Unexpected server error                  |

`VALIDATION_ERROR` responses include `details: [{ field, messages }]`.

## Endpoints

### Collections

- `GET /collections` — list published collections.
- `GET /collections/{collection_id}` — collection metadata + fields.
- `GET /collections/{collection_id}/items` — list published items.
- `POST /collections/{collection_id}/items` — create an item. *(write)*
- `GET /collections/{collection_id}/items/{item_id}` — single item.
- `PUT /collections/{collection_id}/items/{item_id}` — update an item. *(write)*
- `DELETE /collections/{collection_id}/items/{item_id}` — delete an item. *(write)*

### Forms

- `GET /forms` — list forms.
- `GET /forms/{form_id}` — form metadata.
- `GET /forms/{form_id}/submissions` — list submissions.
- `GET /forms/{form_id}/submissions/{submission_id}` — single submission.

## Example

```bash
curl https://your-site/ycode/api/v1/collections \
  -H "Authorization: Bearer $YCODE_API_KEY"

curl -X POST https://your-site/ycode/api/v1/collections/$COLLECTION_ID/items \
  -H "Authorization: Bearer $YCODE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"values": {"name": "Hello", "slug": "hello"}}'
```
