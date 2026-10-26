"""Shared helpers for the evaluation scripts."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ML_SERVICE = ROOT / "ml-service"
if str(ML_SERVICE) not in sys.path:
    sys.path.insert(0, str(ML_SERVICE))  # lets scripts import app.scam, app.embeddings, ...


def require_file(path: Path, what: str, how: str) -> None:
    """Exit with a clear message if required input data is missing. Never substitute made-up data."""
    if not Path(path).is_file():
        print(f"\nMISSING INPUT: {what}\n  expected at: {path}\n  {how}\n"
              "No results were produced, and none are invented.", file=sys.stderr)
        sys.exit(2)
