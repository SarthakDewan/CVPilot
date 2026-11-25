import sys
from pathlib import Path

EVAL = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(EVAL))
import common  # noqa: E402,F401  (adds ml-service to sys.path)
