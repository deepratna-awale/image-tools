# GPU endpoint (RunPod Serverless)

The Oracle VM keeps running the site, the API and the queue. With a GPU endpoint
configured, the worker sends the model work for Background Remover, Background
Changer, Sky Swap and AI Shield to [RunPod Serverless](https://www.runpod.io/serverless-gpu),
which bills per second while a job runs and scales to zero when idle. If the endpoint
fails or times out, the job runs on the VM's CPU as before.

How it fits together: `core/gpu.py` (`GpuProcessor`) wraps each tool's processor in the
worker and posts the image and job parameters to the endpoint's `/runsync`, polling
`/status` for long jobs. The endpoint runs `gpu_handler.py`, which calls the same
processors on the GPU and returns the result image.

## Create the endpoint

1. In the RunPod console, add credit (billing is per second; nothing is charged while idle).
2. **Serverless → New Endpoint → GitHub repo**: pick this repository and branch `main`.
   - Dockerfile path: `backend/deployment/gpu/Dockerfile`
   - Build context: `backend`
3. GPU: a 24 GB card (for example L4, A5000 or RTX 4090). 16 GB is enough for the
   cutout models; AI Shield's High strength needs more headroom.
4. Workers: **min 0** (scale to zero), **max 3**. Idle timeout 5 s, execution timeout 900 s.
   A min of 1 keeps a worker warm (no cold start) but bills around the clock.
5. Copy the **endpoint ID**, and create an **API key** under Settings → API Keys
   (restricted to this endpoint, read/write).

## Point the server at it

Add to `~/image-tools/.env` on the VM, then restart the worker
(`sudo docker compose -f docker-compose.yml -f docker-compose.https.yml up -d worker`):

```
RUNPOD_API_KEY=...
RUNPOD_ENDPOINT_ID=...
# Several jobs can run at once on the GPU; CPU fallbacks still run one at a time
WORKER_CONCURRENCY=4
```

The worker logs `Sending model work to GPU endpoint ...` at start and
`GPU <tool> job took N s` per job. Remove the two `RUNPOD_` lines to go back to CPU only.

Other settings (`backend/config/settings.py`): `GPU_TIMEOUT_SECONDS` (default 900, includes
a cold start) and `GPU_FALLBACK_TO_CPU` (default true).

## What to expect

- The first job after the endpoint has been idle waits for a cold start (tens of seconds
  while a worker starts and loads the models); later jobs are quick until it scales back to zero.
- Requests to RunPod carry the image base64-encoded, so very large uploads can exceed the
  request limit; those jobs fall back to the CPU.
