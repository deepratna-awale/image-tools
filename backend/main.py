from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import uvicorn

from config.settings import settings
from core.public_api import PublicAPIMiddleware
from core.api_keys_router import router as api_keys_router
from core.models.responses import HealthCheckResponse, APIResponse
from services.background_removal.router import router as background_removal_router
from services.background_changing.router import router as background_changing_router
from services.sky_replacement.router import router as sky_replacement_router

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    
    # Initialize services here if needed
    # await initialize_services()
    
    yield
    
    # Shutdown
    logger.info("Shutting down application")
    # Clean up resources here if needed


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="AI-powered image processing API with background removal, background changing, sky replacement, and outpainting",
    lifespan=lifespan
)

# API key and rate limit for requests from other apps (see core/public_api.py)
app.add_middleware(PublicAPIMiddleware)

# CORS is added last so it wraps the key check: preflights are answered first and
# 401/429 responses still carry CORS headers for the browser to read.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "X-API-Key", "Content-Type"],
    expose_headers=["Content-Disposition", "Retry-After"],
)


# Health check endpoint
@app.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """Health check endpoint"""
    try:
        # You can add more sophisticated health checks here
        # Check database, queue, storage, etc.
        
        return HealthCheckResponse(
            status="healthy",
            version=settings.app_version,
            services={
                "api": "healthy",
                "queue": "healthy",  # Add actual queue health check
                "storage": "healthy"  # Add actual storage health check
            }
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail="Service unhealthy")


# Root endpoint
@app.get("/", response_model=APIResponse)
async def root():
    """Root endpoint"""
    return APIResponse(
        success=True,
        message=f"Welcome to {settings.app_name} v{settings.app_version}",
        data={
            "services": [
                "background_removal",
                "background_changing",
                "sky_replacement",
            ],
            "docs": "/docs",
            "health": "/health"
        }
    )


# Include service routers
app.include_router(background_removal_router, prefix=settings.api_prefix)
app.include_router(background_changing_router, prefix=settings.api_prefix)
app.include_router(sky_replacement_router, prefix=settings.api_prefix)
app.include_router(api_keys_router, prefix=settings.api_prefix)

# TODO: outpainting is shown as "coming soon" in the frontend
# app.include_router(outpainting_router, prefix=settings.api_prefix)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.exception(f"Global exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc) if settings.debug else None}
    )


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )
