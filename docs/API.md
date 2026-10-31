# Background Removal API

Other apps can remove image backgrounds through the same service the site uses, and
enlarge images with the upscaler ([Upscaling](#upscaling)) and remove watermarks
([Watermark removal](#watermark-removal)).

- **Base URL:** `https://imagetools.top/api/v1/background-removal`
- **Auth:** an API key in the `X-API-Key` header (or `Authorization: Bearer <key>`).
  Anyone can create a free key at [`https://imagetools.top/api-keys`](https://imagetools.top/api-keys) (see [Getting a key](#getting-a-key)).
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
| 403 | The public API is off on this server |
| 404 | Unknown job, or its result isn't ready |
| 413 | Image over the size limit |
| 429 | Per-minute or daily limit hit; wait the number of seconds in `Retry-After` |

## Getting a key

Open [`/api-keys`](https://imagetools.top/api-keys), say what the key is for, and
press **Create key**. The key is shown once; copy it then, since only its hash is
stored. On the same page you can paste a key to see today's usage or revoke it.

To keep the free tier fair and the server responsive:

- each network address can create **3 keys a day** and hold **5 active keys** (revoke
  one to free a slot);
- the site creates at most **100 free keys a day** for everyone together.

If you need more than a free key allows, open an issue on the repo and ask for a key
with a higher limit.

## Limits

Over a rolling minute, per key: **5 submissions** (`POST`) for free keys, **20** for
keys the admin creates, and **300 status/result requests** (`GET`) for either. Poll
about once a second, not faster.

Per day (reset at 00:00 UTC), counted in images (a batch of 5 counts as 5):

| | Free keys | Admin keys |
| --- | --- | --- |
| Per key | **50 images** | **200 images** by default, or a limit set at creation |
| Shared pool | **300 images** for all free keys together | none |

On top of both, **1,000 images a day for all keys together.** Once that's reached
every key gets 429 until midnight UTC. This is the ceiling on how much server time
other apps can take, so the API can't run up a bill or slow the site down however a
key is used. GPU work also has its own monthly budget; once it's spent, jobs run on
the CPU (slower, same result) until the next month.

A daily-limit 429 says which limit was hit in `detail`, and `Retry-After` counts
down to midnight UTC. Requests from the site's own pages are never counted.

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

## Upscaling

The same keys, limits and job flow (submit, poll `status`, download `result`) work for
the upscaler at **`https://imagetools.top/api/v1/upscaling`**. It enlarges an image with
Real-ESRGAN and checks by itself whether the image is anime/art or a photo to pick the
matching model. The result is a PNG (transparency is kept).

Form fields for `POST /process` and `POST /process-batch`, besides `file`/`files`:

| Field | What it does |
| --- | --- |
| `scale` | Any factor from 1 to 4, such as `1.5`, `2` or `3.2`. Default `2`. |
| `width`, `height` | An exact size in pixels instead of a scale. With both, the image is enlarged until it covers the size and the overflow is cropped from the centre; with one, the other follows the image's shape. Wins over `scale`. |
| `style` | `auto` (default), `photo` or `anime` to skip the check. |

The result can be at most 4× the original on each side and 16.7 megapixels in all
(4096×4096); larger requests get a 400 that says why, before anything is queued.

```bash
API=https://imagetools.top/api/v1/upscaling

# 2.5x
JOB=$(curl -s -H "X-API-Key: $KEY" -F "file=@art.png" -F scale=2.5 $API/process | jq -r .job_id)
# or exactly 3840x2160, cropping what doesn't fit
JOB=$(curl -s -H "X-API-Key: $KEY" -F "file=@photo.jpg" -F width=3840 -F height=2160 $API/process | jq -r .job_id)

until [ "$(curl -s -H "X-API-Key: $KEY" $API/status/$JOB | jq -r .status)" = completed ]; do sleep 1; done
curl -s -H "X-API-Key: $KEY" $API/result/$JOB -o upscaled.png
```

The `removeBackground` function above works for it too: point `API` at the upscaling
URL and append `scale` (or `width`/`height`) to the form.

## Watermark removal

**`https://imagetools.top/api/v1/watermark-removal`** takes the same keys, limits and job
flow. Florence-2 finds the watermark (text or logo) and an AI image editor (FLUX.1
Kontext) removes it, rebuilding the photo underneath. The result is a PNG at the original size
(transparency is kept). It runs on a GPU; the first job after a quiet spell waits a
minute or two for it to start.

Form fields for `POST /process` and `POST /process-batch`, besides `file`/`files`:

| Field | What it does |
| --- | --- |
| `mask` | Optional. What to remove: an image white where to remove and black elsewhere (or opaque strokes on a transparent layer), stretched to fit if it's another size. Without it the watermark is found automatically; if none is found the job fails with `No watermark found`. A batch shares one mask. |
| `mode` | `remove` (default) or `detect`: only find the watermark and return its mask (white on black PNG) as the result, to check or edit before removing. |

Images can be up to 36 megapixels.

```bash
API=https://imagetools.top/api/v1/watermark-removal

# Find and remove the watermark by itself
JOB=$(curl -s -H "X-API-Key: $KEY" -F "file=@photo.jpg" $API/process | jq -r .job_id)
# or remove what's white in your own mask
JOB=$(curl -s -H "X-API-Key: $KEY" -F "file=@photo.jpg" -F "mask=@mask.png" $API/process | jq -r .job_id)

until [ "$(curl -s -H "X-API-Key: $KEY" $API/status/$JOB | jq -r .status)" = completed ]; do sleep 2; done
curl -s -H "X-API-Key: $KEY" $API/result/$JOB -o clean.png
```

Only remove watermarks from images you own or have permission to edit.

## Calling from a browser

Keep the key on your server where you can: call the API from your backend (or a
serverless function) and hand the PNG to your page. Anything shipped to a browser
can be read by its users.

If a page must call the API directly, its origin has to be on the server's
allowlist (`ALLOWED_ORIGINS`, below), and you should treat that key as public and
give it its own key with a low daily limit so it can be revoked on its own.

## Checking or revoking your key

Besides the page, a key can describe or revoke itself (send it as `X-API-Key`):

| Method | Path | What it does |
| --- | --- | --- |
| GET | `https://imagetools.top/api/api-keys/me` | Name, `daily_limit`, `used_today`, `rate_limit_per_minute`, `resets_in_seconds` |
| DELETE | `https://imagetools.top/api/api-keys/me` | Revoke the key; it stops working on the next request |

## Managing keys (admin)

At the bottom of `/api-keys`, **Admin** asks for the admin token (`ADMIN_TOKEN` in
the server's `.env`; `deploy/oracle/setup.sh` generates one, and
`grep ADMIN_TOKEN .env` shows it). From there you can:

- **Create** a key with a name and, optionally, its own images-per-day limit. Admin
  keys don't count against the free-key pool or sign-up limits. The full key is shown
  once; only its SHA-256 hash is stored.
- **See** each key's usage today, when it was last used, and the totals against the
  all-keys cap and the free-key pool. Free keys are listed under **Self-serve keys**.
- **Revoke** any key; it stops working on the next request.

Wrong admin tokens are throttled to 10 a minute. Keys and daily counts live in
`api_keys.sqlite3` on the storage volume, so they survive restarts and rebuilds.
Network addresses are never stored as such: sign-up limits use a salted hash of the
address. Without `ADMIN_TOKEN` the admin view is disabled; the free sign-up keeps
working unless `API_PUBLIC_SIGNUP=false`.

## Server setup

Optional settings in the repo's `.env` on the server:

```bash
# Keys that work alongside the ones made on /api-keys (comma-separated)
API_KEYS=3f9c...,a71b...
# Only for pages that call the API from the browser (comma-separated origins)
ALLOWED_ORIGINS=https://my-other-app.example
# Per key per minute
API_RATE_LIMIT_PER_MINUTE=20
API_POLL_LIMIT_PER_MINUTE=300
# Images per UTC day: default per key, all keys together, and how many keys may exist
API_DAILY_LIMIT_PER_KEY=200
API_DAILY_LIMIT_TOTAL=1000
API_MAX_KEYS=20
# Self-serve keys: on/off, per key per day, all free keys per day, submissions per minute
API_PUBLIC_SIGNUP=true
API_PUBLIC_DAILY_LIMIT_PER_KEY=50
API_PUBLIC_DAILY_LIMIT_TOTAL=300
API_PUBLIC_RATE_LIMIT_PER_MINUTE=5
# Sign-ups: new keys per address per day, active keys per address, per day overall, ever active
API_PUBLIC_KEYS_PER_IP_PER_DAY=3
API_PUBLIC_ACTIVE_KEYS_PER_IP=5
API_PUBLIC_SIGNUPS_PER_DAY=100
API_PUBLIC_MAX_KEYS=2000
```

Then restart: `sudo docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build`.

How it fits together: Caddy sends `/api/v1/background-removal/*`, `/api/v1/upscaling/*` and `/api/v1/watermark-removal/*` straight to the
API container and marks those requests as public; the API checks the key and the
rate limit only for marked requests. The site's own pages reach the API over the
internal Docker network, so they keep working with or without keys. The API port
is never published, so the key check can't be bypassed from outside.
