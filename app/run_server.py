"""Run admin backend on port 8000.

Usage:
  python app/run_server.py
"""

import os
import sys
import uvicorn


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.main import app


if __name__ == "__main__":
  uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
