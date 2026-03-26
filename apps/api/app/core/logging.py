import logging


def setup_logging() -> None:
  # Keep logging simple in scaffold; production can upgrade to structlog/loguru.
  logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s"
  )

