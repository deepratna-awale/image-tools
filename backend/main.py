from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import uvicorn

from config.settings import settings
from core.models.responses import HealthCheckResponse, APIResponse
from services.background_removal.router import router as background_removal_router

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

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=settings.allowed_methods,
    allow_headers=settings.allowed_headers,
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
                "outpainting"
            ],
            "docs": "/docs",
            "health": "/health"
        }
    )


# Include service routers
app.include_router(background_removal_router, prefix=settings.api_prefix)

# TODO: Add other service routers as you implement them
# app.include_router(background_changing_router, prefix=settings.api_prefix)
# app.include_router(sky_replacement_router, prefix=settings.api_prefix)
# app.include_router(outpainting_router, prefix=settings.api_prefix)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Global exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )
