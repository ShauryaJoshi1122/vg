from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

import boto3
from botocore.config import Config as BotoConfig

from app.core.config import settings


def parse_s3_uri(uri: str) -> Tuple[str, str]:
  # Expected: s3://bucket/key/path.mp4
  if not uri.startswith("s3://"):
    raise ValueError("Not an s3:// URI")
  without = uri[len("s3://") :]
  bucket, _, key = without.partition("/")
  if not bucket or not key:
    raise ValueError("Invalid s3 URI")
  return bucket, key


def s3_client():
  if not settings.s3_access_key or not settings.s3_secret_key:
    raise RuntimeError("S3 credentials are not configured")

  return boto3.client(
    "s3",
    region_name=settings.s3_region,
    aws_access_key_id=settings.s3_access_key,
    aws_secret_access_key=settings.s3_secret_key,
    endpoint_url=settings.s3_endpoint_url,
    config=BotoConfig(signature_version="s3v4"),
  )


def get_presigned_download_url(s3_uri: str, expires_in_seconds: int = 3600) -> str:
  bucket, key = parse_s3_uri(s3_uri)
  client = s3_client()
  return client.generate_presigned_url(
    "get_object",
    Params={"Bucket": bucket, "Key": key},
    ExpiresIn=expires_in_seconds,
  )

