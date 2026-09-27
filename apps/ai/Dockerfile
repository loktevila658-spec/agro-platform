FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi==0.116.1 uvicorn==0.35.0
COPY apps/ai/pyproject.toml ./pyproject.toml
COPY apps/ai/src ./src
EXPOSE 8000
CMD ["sh", "-c", "uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
