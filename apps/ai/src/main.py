from fastapi import FastAPI

app = FastAPI(title="AgroPlatform AI shell", version="0.0.0")


@app.get("/")
def bootstrap_status() -> dict[str, str]:
    return {"status": "bootstrap"}
