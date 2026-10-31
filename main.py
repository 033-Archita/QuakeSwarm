"""Root-level Uvicorn entry point; delegates to the backend application."""

from backend.main import app

__all__ = ["app"]
