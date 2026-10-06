# Background Removal API

Other apps can remove image backgrounds through the same service the site uses.

- **Base URL:** `https://imagetools.top/api/v1/background-removal`
- **Auth:** an API key in the `X-API-Key` header (or `Authorization: Bearer <key>`)
- **Input:** any common image format (JPEG, PNG, WebP…), up to 10 MB per image, up to 10 images per batch
- **Output:** a transparent PNG (or a ZIP of PNGs for a batch)

Processing is asynchronous: you submit an image, poll its status until it is
`completed` (or `failed`), then download the result. A single image usually
finishes in a few seconds.

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/process` | Queue one image (form field `file`). Returns `job_id`. |
| GET | `/status/{job_id}` | `status` is `queued`, `processing`, `completed` or `failed` (with `error_message`). |
| GET | `/result/{job_id}` | The PNG, once the job is `completed`. |
| POST | `/process-batch` | Queue up to 10 images (repeat form field `files`). Returns `batch_id` and `job_ids`. |
| GET | `/batch-status/{batch_id}` | Overall `status`, `progress`, `completed_files`, `failed_files`. |
| GET | `/batch-results/{batch_id}` | ZIP of every finished image in the batch. |

Errors are JSON with a `detail` message:

| Status | Meaning |
| --- | --- |
| 400 | Not an image, or more than 10 files in a batch |
| 401 | Missing or wrong API key |
| 403 | The server has no API keys configured, so the public API is off |
| 404 | Unknown job, or its result isn't ready |
| 413 | Image over the size limit |
| 429 | Rate limit hit; wait the number of seconds in `Retry-After` |

## Limits

Per API key, over a rolling minute: **20 submissions** (`POST`) and **300
status/result requests** (`GET`). Poll about once a second, not faster.

## curl

```bash
KEY=your-api-key
API=https://imagetools.top/api/v1/background-removal

# 1. Submit
JOB=$(curl -s -H "X-API-Key: $KEY" -F "file=@photo.jpg" $API/process | jq -r .job_id)

# 2. Poll until completed
until [ "$(curl -s -H "X-API-Key: $KEY" $API/status/$JOB | jq -r .status)" = completed ]; do sleep 1; done

# 3. Download
curl -s -H "X-API-Key: $KEY" $API/result/$JOB -o photo-no-bg.png
```

## JavaScript / TypeScript

Works in Node 18+, Deno, Bun and edge runtimes (all have `fetch`, `FormData` and `Blob`).

```ts
const API = "https://imagetools.top/api/v1/background-removal";
const KEY = process.env.IMAGETOOLS_API_KEY!;

/** Remove the background from an image; resolves to a transparent PNG. */
export async function removeBackground(image: Blob, filename = "image.png"): Promise<Blob> {
  const headers = { "X-API-Key": KEY };

  const form = new FormData();
  form.append("file", image, filename);
  const submit = await fetch(`${API}/process`, { method: "POST", headers, body: form });
  if (!submit.ok) throw new Error(`Submit failed: ${submit.status} ${await submit.text()}`);
  const { job_id } = await submit.json();

  for (let attempt = 0; attempt < 120; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await fetch(`${API}/status/${job_id}`, { headers });
    if (res.status === 429) continue;
    if (!res.ok) throw new Error(`Status failed: ${res.status} ${await res.text()}`);
    const { status, error_message } = await res.json();
    if (status === "failed") throw new Error(error_message || "Background removal failed");
    if (status === "completed") {
      const result = await fetch(`${API}/result/${job_id}`, { headers });
      if (!result.ok) throw new Error(`Download failed: ${result.status}`);
      return result.blob();
    }
  }
  throw new Error("Timed out waiting for background removal");
}
```

Node example, file in and file out:

```ts
import { readFile, writeFile } from "node:fs/promises";

const input = new Blob([await readFile("photo.jpg")], { type: "image/jpeg" });
const png = await removeBackground(input, "photo.jpg");
await writeFile("photo-no-bg.png", Buffer.from(await png.arrayBuffer()));
```

Set `type` on the Blob: the API rejects uploads whose content type isn't `image/*`.

## Calling from a browser

Keep the key on your server where you can: call the API from your backend (or a
serverless function) and hand the PNG to your page. Anything shipped to a browser
can be read by its users.

If a page must call the API directly, its origin has to be on the server's
allowlist (`ALLOWED_ORIGINS`, below), and you should treat that key as public and
give it its own entry in `API_KEYS` so it can be rotated on its own.

## Server setup

On the server, in the repo's `.env`:

```bash
# One key per app, comma-separated. Generate each with: openssl rand -hex 24
API_KEYS=3f9c...,a71b...
# Only for pages that call the API from the browser (comma-separated origins)
ALLOWED_ORIGINS=https://my-other-app.example
# Optional, per key per minute
API_RATE_LIMIT_PER_MINUTE=20
API_POLL_LIMIT_PER_MINUTE=300
```

Then restart: `sudo docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build`.
To revoke a key, remove it from `API_KEYS` and restart.

How it fits together: Caddy sends `/api/v1/background-removal/*` straight to the
API container and marks those requests as public; the API checks the key and the
rate limit only for marked requests. The site's own pages reach the API over the
internal Docker network, so they keep working with or without keys. The API port
is never published, so the key check can't be bypassed from outside.
