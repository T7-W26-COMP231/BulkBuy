#!/usr/bin/env python3
"""
avatarImages.py

- Downloads every URL in AVATAR_URLS (including URLs already pointing to cfg-j).
- Deduplicates by image content (SHA256).
- Uploads unique images to S3 bucket cfg-j under db-bb/avatars using a deterministic
  16-digit numeric filename (zero-padded) plus extension when available.
- Sets ACL to public-read.
- Writes final public URLs (one per line) to avatarImages.txt.

Requirements:
- Python 3.8+
- boto3
- requests
- AWS credentials available in your environment (CLI, env vars, or role)
"""

import hashlib
import logging
import mimetypes
import os
from pathlib import Path
from urllib.parse import urlparse, unquote

import boto3
import requests

# Configuration
BUCKET = "cfg-j"
PREFIX = "db-bb/avatars"
OUTPUT_FILE = "avatarImages.txt"
TIMEOUT = 30
CHUNK_SIZE = 8192

AVATAR_URLS = [
    "https://img.freepik.com/free-vector/smiling-young-man-illustration_1308-174669.jpg?semt=ais_hybrid&w=740&q=80",
    "https://static.vecteezy.com/system/resources/thumbnails/048/216/761/small/modern-male-avatar-with-black-hair-and-hoodie-illustration-free-png.png",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQrPEzGhqHh3jWuaNyHDM0C8x56izVbQNyMag&s",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRkP1pyF8Kka5feseIesokhpE3wS5_7XkHovw&s",
    "https://cfg-j.s3.us-east-1.amazonaws.com/avataaars.png"
]

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def download_bytes(url: str) -> (bytes, str):
    """Download URL and return bytes and content-type (may be None)."""
    logging.info("Downloading: %s", url)
    resp = requests.get(url, stream=True, timeout=TIMEOUT)
    resp.raise_for_status()
    chunks = []
    for chunk in resp.iter_content(CHUNK_SIZE):
        if chunk:
            chunks.append(chunk)
    content = b"".join(chunks)
    return content, resp.headers.get("Content-Type")


def ext_from_content_type(content_type: str) -> str:
    if not content_type:
        return ""
    ext = mimetypes.guess_extension(content_type.split(";")[0].strip())
    return ext or ""


def ext_from_url(url: str) -> str:
    path = urlparse(url).path
    name = unquote(os.path.basename(path))
    if "." in name:
        return "." + name.split(".")[-1]
    return ""


def numeric_name_from_hash(content_bytes: bytes) -> (str, str):
    """Return zero-padded 16-digit decimal name and full hex hash."""
    h = hashlib.sha256(content_bytes).hexdigest()
    num = int(h, 16) % (10 ** 16)
    return f"{num:016d}", h


def s3_public_url(bucket: str, key: str) -> str:
    return f"https://{bucket}.s3.amazonaws.com/{key}"


def upload_to_s3(s3_client, content: bytes, bucket: str, key: str, content_type: str = None) -> str:
    extra_args = {"ACL": "public-read"}
    if content_type:
        extra_args["ContentType"] = content_type
    s3_client.put_object(Bucket=bucket, Key=key, Body=content, **extra_args)
    return s3_public_url(bucket, key)


def main():
    # Preserve order, remove duplicate input URLs (same URL string)
    seen_input = set()
    urls = []
    for u in AVATAR_URLS:
        if u not in seen_input:
            seen_input.add(u)
            urls.append(u)

    s3 = boto3.client("s3")
    hash_to_url = {}
    output_urls = []

    for url in urls:
        try:
            # Always download and process every URL (even if it points to cfg-j)
            content, content_type = download_bytes(url)
        except Exception as e:
            logging.error("Failed to download %s: %s", url, e)
            continue

        name16, full_hash = numeric_name_from_hash(content)

        # If we've already uploaded identical content, reuse URL
        if full_hash in hash_to_url:
            logging.info("Duplicate content detected; reusing existing URL for %s", url)
            output_urls.append(hash_to_url[full_hash])
            continue

        # Determine extension: prefer content-type, then URL, else .img
        ext = ext_from_content_type(content_type) or ext_from_url(url) or ".img"
        key = f"{PREFIX}/{name16}{ext}"

        try:
            public_url = upload_to_s3(s3, content, BUCKET, key, content_type)
        except Exception as e:
            logging.error("Failed to upload %s to S3: %s", url, e)
            continue

        logging.info("Uploaded %s -> %s", url, key)
        hash_to_url[full_hash] = public_url
        output_urls.append(public_url)

    # Write unique public URLs preserving order
    Path(OUTPUT_FILE).parent.mkdir(parents=True, exist_ok=True)
    seen = set()
    unique = []
    for u in output_urls:
        if u not in seen:
            seen.add(u)
            unique.append(u)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        for u in unique:
            f.write(u + "\n")

    logging.info("Done. %d unique avatar URLs written to %s", len(unique), OUTPUT_FILE)


if __name__ == "__main__":
    main()
