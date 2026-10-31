<p align="center">
  <a href="https://imagetools.top"><img src=".github/social-preview.png" alt="Image Tools: every image tool you need, free" width="100%"></a>
</p>

<h1 align="center">Image Tools</h1>

<p align="center">
  Free image tools that work in your browser. No sign-up, no watermarks.<br>
  <a href="https://imagetools.top"><strong>imagetools.top</strong></a> ·
  <a href="./docs/API.md">API</a> ·
  <a href="#run-it-yourself">Run it yourself</a>
</p>

<p align="center">
  <a href="https://github.com/deepratna-awale/image-tools/actions/workflows/ci.yml"><img src="https://github.com/deepratna-awale/image-tools/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

## Tools

### Backgrounds & AI

| Tool | What it does |
| --- | --- |
| [Background Remover](https://imagetools.top/bg-remover) | Cut out the subject and get a transparent PNG. Up to 10 images at once, with a ZIP download. |
| [Background Changer](https://imagetools.top/bg-changer) | Put your subject on a new background, a solid colour or your own picture. |
| [Blur Background](https://imagetools.top/blur-background) | Blur what's behind your subject for a portrait-mode look. |
| [Sky Swap](https://imagetools.top/sky-swap) | Replace a dull sky with a sunset, golden hour or a sky of your own. |
| [Image Upscaler](https://imagetools.top/upscaler) | Enlarge up to 4× (any factor, like 1.5×) or to an exact size, cropping to fit. Detects anime/art vs. photos and uses the matching Real-ESRGAN model. |
| [Watermark Remover](https://imagetools.top/watermark-remover) | Florence-2 finds watermarks, logos and text, and FLUX.1 Kontext edits them out. Fix the marked area with a brush first if you like. |
| Outpainting | Extend a photo beyond its edges. *Coming soon.* |

### Edit & Convert

| Tool | What it does |
| --- | --- |
| [Resize, Compress & Convert](https://imagetools.top/resize-convert) | Opens JPG, PNG, WebP, AVIF, HEIC/HEIF, GIF, BMP, ICO, TIFF and SVG; saves as JPG, PNG, WebP, AVIF, GIF, BMP, ICO, TIFF or PDF, with an optional target file size. |
| [Passport & ID Photo](https://imagetools.top/passport-photo) | Country presets on a plain background, plus a printable 6×4 in sheet. |
| [Watermark & Add Text](https://imagetools.top/watermark) | Text or logo watermarks on one photo or a whole batch. |
| [Images to PDF](https://imagetools.top/images-to-pdf) | Combine images into one PDF in the order you choose. |

### Privacy & Metadata

| Tool | What it does |
| --- | --- |
| [Remove Photo Metadata](https://imagetools.top/remove-metadata) | Strip GPS location, camera details and other EXIF/XMP data without re-encoding. |
| [Prompt Reader](https://imagetools.top/prompt-reader) | See the prompt, seed, model and settings saved in Stable Diffusion images (AUTOMATIC1111/Forge, ComfyUI, Fooocus, InvokeAI, NovelAI). |
| [AI Shield](https://imagetools.top/ai-shield) | Cloak art against Stable Diffusion mimicry and img2img (an encoder attack in the style of PhotoGuard and Mist, aimed at the SD 1.x/2.x and SDXL VAEs, run on the CPU) and tag files as not for AI training (IPTC Data Mining, TDMRep, `noai`). |

Resize/convert, remove metadata, watermark and images to PDF run entirely in your browser, so those files never leave your device. The AI tools run on the server's CPU; no paid APIs are involved.

## Developer API

Other apps can call background removal, the upscaler and the watermark remover on the live site with an API key. Anyone can create a free key at [imagetools.top/api-keys](https://imagetools.top/api-keys); free keys have per-minute and daily limits.

```bash
KEY=your-api-key
API=https://imagetools.top/api/v1/background-removal

JOB=$(curl -s -H "X-API-Key: $KEY" -F "file=@photo.jpg" $API/process | jq -r .job_id)
curl -s -H "X-API-Key: $KEY" $API/status/$JOB          # poll until "completed"
curl -s -H "X-API-Key: $KEY" $API/result/$JOB -o cutout.png
```

Endpoints, batch jobs, limits, error codes and JavaScript examples are in [docs/API.md](./docs/API.md).

## How it works

```
Browser ──► Next.js frontend ──► FastAPI API ──► RabbitMQ ──► CPU worker
            (browser-only tools       │                        (rembg, SegFormer,
             run right here)          └──── shared storage ◄───  AI Shield, …)
```

| Part | Stack |
| --- | --- |
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| API | FastAPI, Pydantic; proxies through the frontend, so the API port is never public |
| Worker | Python job processor: rembg for cutouts, SegFormer-b0 (ONNX) for sky masks, Pillow and NumPy for compositing |
| GPU endpoint (optional) | The same processors on a RunPod Serverless GPU, which the worker hands model work to when configured ([setup](./backend/deployment/gpu/README.md)) |
| Queue & storage | RabbitMQ; local volume (or S3) shared by the API and worker |
| Hosting | One Oracle Cloud Always Free Arm VM with Docker Compose and Caddy for HTTPS |

## Run it yourself

### Docker (everything)

```bash
cp .env.example .env      # set RABBITMQ_DEFAULT_PASS
docker compose up -d --build
```

This starts the frontend on http://localhost:3000 plus the API, worker and RabbitMQ. Check it with `docker compose ps` and `curl localhost:3000/api/health`.

### Local development

Needs Python 3.11+, Node.js 18+, pnpm and a running RabbitMQ.

```bash
# API
cd backend && cp .env.example .env && ./start.sh

# Worker (new terminal)
cd backend && ./start-worker.sh

# Frontend (new terminal)
cd frontend && cp .env.example .env.local && pnpm install && pnpm dev
```

Frontend at http://localhost:3000, API at http://localhost:8000 with interactive docs at http://localhost:8000/docs.

### Tests

```bash
cd backend && python -m pytest tests/
cd frontend && pnpm lint && pnpm build
```

CI (`.github/workflows/ci.yml`) runs both on every pull request and push to `main`, and builds both Docker images.

## Deployment

The default target is one Linux host running the root `docker-compose.yml`:

| Service | Image | Notes |
| --- | --- | --- |
| `frontend` | `frontend/Dockerfile` (Next.js standalone) | Published on `FRONTEND_PORT` (3000). Proxies all API calls server-side via `BACKEND_URL`. |
| `api` | `backend/deployment/docker/Dockerfile` | FastAPI on port 8000, bound to `127.0.0.1` only. |
| `worker` | same image as `api` | Runs `python -m workers.image_processor`. Models are baked into the image. |
| `rabbitmq` | `rabbitmq:3-management-alpine` | Job queue, data persisted in a volume. |

Put a TLS-terminating reverse proxy in front of port 3000. For free hosting, [deploy/oracle/README.md](deploy/oracle/README.md) sets the stack up on an Oracle Cloud Always Free Arm VM with Caddy (`docker-compose.https.yml`); `deploy/oracle/setup.sh` does the server side in one command. This is how imagetools.top runs.

The `api` and `worker` share job files and status through the `storage` volume, so they must run on the same host. Splitting services across machines (for example the ECS configs in `backend/deployment/aws`) needs shared job state first.

### Configuration

Key variables in `backend/.env`:

```env
API_PREFIX=/api/v1
QUEUE_TYPE=rabbitmq
RABBITMQ_URL=amqp://guest:guest@localhost/
STORAGE_TYPE=local            # or s3, with S3_BUCKET_NAME and AWS credentials
LOCAL_STORAGE_PATH=./uploads
MAX_FILE_SIZE_MB=50
```

The frontend needs `BACKEND_URL` (default `http://localhost:8000`). API key limits and the admin token for `/api-keys` are covered in [docs/API.md](./docs/API.md#server-setup).

### Model licences

The sky-swap model (SegFormer-b0 fine-tuned on ADE20K) is under NVIDIA's non-commercial licence. Point `SKY_MODEL_URL` (a build arg in `backend/deployment/docker/Dockerfile`) at a commercially licensed model before running the site commercially.

The background-removal model (BRIA RMBG 2.0) is under CC BY-NC 4.0, also non-commercial. Set the `REMBG_MODEL` build arg and env var to `isnet-general-use` or `birefnet-general` for a permissive alternative.

## Project structure

```
image-tools/
├── frontend/              Next.js app: one route per tool, shared components, tile art in public/tiles
├── backend/
│   ├── main.py            FastAPI app
│   ├── services/          one folder per tool, each with its own router: background_removal,
│   │                      background_changing, sky_replacement, metadata_reading, ai_shield
│   ├── workers/           queue consumer that runs the services
│   ├── core/              models, messaging, storage, API keys
│   └── deployment/        Dockerfile and AWS configs
├── deploy/                Caddyfile and Oracle Cloud setup
└── docs/API.md            public API reference
```

### Adding a tool

1. Add a service under `backend/services/` with a `process_job` method, add it to the `ServiceType` enum and register it in the worker.
2. Add a `router.py` in the service folder and include it in `backend/main.py`.
3. Add a page under `frontend/app/`, an entry in `frontend/lib/tools.ts`, and a tile in `frontend/public/tiles/`.

Browser-only tools skip steps 1 and 2.

## More docs

- [Public background removal API](./docs/API.md)
- [Backend architecture](./backend/ARCHITECTURE.md)
- [Backend testing](./backend/TESTING_DOCUMENTATION.md)
- [Oracle Cloud free hosting](./deploy/oracle/README.md)
- [AWS deployment guide](./backend/deployment/aws/DEPLOYMENT_GUIDE.md)

## Roadmap

- [x] Background remover, changer, blur and sky swap
- [x] Browser-only edit and privacy tools
- [x] Prompt Reader and AI Shield
- [x] Public API with self-serve keys
- [ ] Outpainting
- [ ] Shared job state (Redis) so the API and worker can scale out
- [ ] More tools: face blur, colorizer, OCR

## License

[MIT](./LICENSE). Some models and libraries the site uses have their own licenses: the Sky Swap model (SegFormer) is NVIDIA non-commercial, the background-removal model (BRIA RMBG 2.0) is CC BY-NC 4.0, the watermark remover's FLUX.1 Kontext [dev] is under the FLUX.1 [dev] non-commercial license (`WATERMARK_FILL_MODEL=sdxl` switches to SDXL Inpainting, which allows commercial use), and libheif is LGPL; see [imagetools.top/terms](https://imagetools.top/terms). The site's [privacy policy](https://imagetools.top/privacy) covers what happens to uploads (deleted within 24 hours by default, `FILE_RETENTION_HOURS`).
