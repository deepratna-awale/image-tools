# GPU endpoint (RunPod Serverless)

The Oracle VM keeps running the site, the API and the queue. With a GPU endpoint
configured, the worker sends the model work for Background Remover, Background
Changer, Sky Swap, AI Shield, the Upscaler, the Watermark Remover and Outpainting to [RunPod Serverless](https://www.runpod.io/serverless-gpu),
which bills per second while a job runs and scales to zero when idle. If the endpoint
fails or times out, the job runs on the VM's CPU as before.

How it fits together: `core/gpu.py` (`GpuProcessor`) wraps each tool's processor in the
worker and posts the image and job parameters to the endpoint's `/runsync`, polling
`/status` for long jobs. The endpoint runs `gpu_handler.py`, which calls the same
processors on the GPU and returns the result image.

## Create the endpoint

1. In the RunPod console, add credit (billing is per second; nothing is charged while idle).
2. **Serverless → New Endpoint → Docker image**: `ghcr.io/deepratna-awale/image-tools-gpu:latest`.
   The [GPU image workflow](../../../.github/workflows/gpu-image.yml) publishes it on every
   push to `main` that touches the backend (the package must be public, or give RunPod
   registry credentials). Pin a commit tag instead of `latest` to control rollouts.
   RunPod can also build it from the repo (**GitHub repo** source, Dockerfile
   `backend/deployment/gpu/Dockerfile`, build context `backend`).
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

## Monthly budget

RunPod has no monthly spending cap, so the worker keeps one: it estimates each job's
cost (start-up + run time + the idle timeout, at the GPU's hourly price) and, once the
month's total reaches `GPU_MONTHLY_BUDGET_USD` (default 10), runs jobs on the CPU until
the next UTC month. The running total is in `gpu_spend.json` on the storage volume and
is logged as `GPU spend this month: $X of $Y` after each job. Keep `GPU_PRICE_PER_HOUR`
(default 0.69) and `GPU_IDLE_SECONDS` (default 5) in line with the endpoint's GPU and
idle timeout. `GPU_MONTHLY_BUDGET_USD=0` removes the cap.

## What to expect

- The first job after the endpoint has been idle waits for a cold start (tens of seconds
  while a worker starts and loads the models); later jobs are quick until it scales back to zero.
- Requests to RunPod carry the image base64-encoded, so very large uploads can exceed the
  request limit; those jobs fall back to the CPU.
- The Watermark Remover and Outpainting run FLUX.1 Kontext and have no CPU fallback: when
  the GPU is unavailable or over budget, their jobs fail with a "busy, try again" message.
  Outpainting takes 1 to 4 minutes per job (big extensions are painted in a few passes).
- If the endpoint's workers sit at **throttled** for a long time, RunPod has no free GPU of
  the chosen type on their host. Allowing more GPU types (same 24 GB class) in the endpoint
  settings, or deleting the throttled workers so new ones start elsewhere, gets jobs moving.

## Releasing a new GPU image

The endpoint is pinned to a commit tag. To test GPU changes from a branch before merging,
run the GPU image workflow on that branch (**Actions → GPU image → Run workflow**, about
30 minutes), then in the RunPod console open the endpoint, **Manage → New release**, set
the image to `ghcr.io/deepratna-awale/image-tools-gpu:<commit sha>` and **Deploy new
release**. Workers roll over as they go idle; until then an old worker can still take
jobs, so check the **Workers** tab shows the new version before testing.
