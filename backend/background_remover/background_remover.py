from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Request
from fastapi.responses import StreamingResponse, JSONResponse
from rembg import remove
import numpy as np
import aio_pika
import asyncio
import io
import os
import base64
from contextlib import asynccontextmanager

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost/")

@asynccontextmanager
def lifespan(app: FastAPI):
    # Startup
    task = asyncio.create_task(process_queue())
    yield
    # Shutdown (optional):
    task.cancel()

app = FastAPI(lifespan=lifespan)

QUEUE_NAME = "bg_remove_queue"

async def connect_rabbitmq():
    connection = await aio_pika.connect_robust(RABBITMQ_URL)
    channel = await connection.channel()
    queue = await channel.declare_queue(QUEUE_NAME, durable=True)
    return connection, channel, queue

async def send_to_queue(image_bytes: bytes):
    connection, channel, _ = await connect_rabbitmq()
    await channel.default_exchange.publish(
        aio_pika.Message(body=image_bytes),
        routing_key=QUEUE_NAME,
    )
    await connection.close()

async def process_queue():
    connection, channel, queue = await connect_rabbitmq()

    async with queue.iterator() as queue_iter:
        async for message in queue_iter:
            async with message.process():
                output = remove(message.body)
                # Save or process output as needed
                # For demo, just print size
                print(f"Processed image, output size: {len(output)} bytes")

@app.post("/remove-background/")
async def remove_background(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None
):
    image_bytes = await file.read()
    await send_to_queue(image_bytes)
    return JSONResponse({"status": "queued"})

# Optional: endpoint to process and return result directly (not queued)
@app.post("/remove-background-direct/")
async def remove_background_direct(file: UploadFile = File(...)):
    image_bytes = await file.read()
    output = remove(image_bytes)
    return StreamingResponse(io.BytesIO(output), media_type="image/png")

@app.post("/remove-background-base64/")
async def remove_background_base64(request: Request):
    data = await request.json()
    image_b64 = data.get("image")
    if not image_b64:
        return JSONResponse({"error": "No image provided"}, status_code=400)
    try:
        image_bytes = base64.b64decode(image_b64)
        output = remove(image_bytes)
        output_b64 = base64.b64encode(output).decode("utf-8")
        return JSONResponse({"result": output_b64})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

def remove_background(image: np.ndarray) -> np.ndarray:
    """
    Remove white background from an RGB image and return an RGBA image with transparency.
    White pixels become transparent, others remain opaque.
    """
    if image.ndim != 3 or image.shape[2] != 3:
        raise ValueError("Input must be an RGB image (H, W, 3)")
    # Create alpha channel: 0 if white, 255 otherwise
    alpha = np.where((image == 255).all(axis=2), 0, 255).astype(np.uint8)
    rgba = np.dstack((image, alpha))
    return rgba

