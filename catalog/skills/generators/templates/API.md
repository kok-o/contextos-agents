# {{Project Name}} — API Specification

## Base URL

`{{base_url}}` (e.g., `https://api.example.com/v1`)

## Authentication

{{auth_method}} (e.g., Bearer token via JWT)

## Endpoints

### {{Module Name}}

#### `{{METHOD}} {{path}}`

{{description}}

**Request:**

```json
{{request_body}}
```

**Response (200):**

```json
{{response_body}}
```

**Errors:**

| Code | Description |
| --- | --- |
| 400 | {{bad_request_reason}} |
| 401 | Unauthorized |
| 404 | {{not_found_reason}} |

---

## Error Format

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

## Pagination

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

## Rate Limiting

- {{rate_limit}} requests per {{window}}
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Versioning

- URL-based: `/v1/`, `/v2/`
- Breaking changes require new version
