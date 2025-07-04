from fastapi import FastAPI
from background_remover.background_remover import app as background_remover_app

app = FastAPI()

# Mount the background remover app
app.mount("/background-remover", background_remover_app)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
