#!/usr/bin/env python3
"""
Download images, deduplicate by content, upload to S3 with 16-digit numeric names,
make public, and write public URLs to itemImages.txt
"""

import os
import hashlib
import logging
import requests
import boto3
import mimetypes
from urllib.parse import urlparse, unquote
from pathlib import Path

# Configuration
BUCKET = "cfg-j"
PREFIX = "db-bb/images"
OUTPUT_FILE = "itemImages.txt"
TIMEOUT = 30
CHUNK_SIZE = 8192

IMAGE_URLS = [
    "https://static8.depositphotos.com/1228953/977/i/450/depositphotos_9777026-stock-photo-box-white.jpg",
    "https://st4.depositphotos.com/3258807/23887/i/450/depositphotos_238877880-stock-photo-young-slim-asian-fashion-designer.jpg",
    "https://st4.depositphotos.com/3258807/23887/i/450/depositphotos_238873710-stock-photo-new-model-of-a-jacket.jpg",
    "https://st2.depositphotos.com/1177973/11747/i/450/depositphotos_117474244-stock-photo-baby-accessories-for-hygiene.jpg",
    "https://st3.depositphotos.com/22341038/36599/i/450/depositphotos_365993044-stock-photo-baby-hygiene-accessories-wooden-table.jpg",
    "https://st3.depositphotos.com/22341038/36599/i/450/depositphotos_365991976-stock-photo-baby-hygiene-accessories-white-background.jpg",
    "https://st2.depositphotos.com/1006269/8791/i/450/depositphotos_87917690-stock-photo-cd-dvd-mockup.jpg",
    "https://st3.depositphotos.com/1588812/16381/i/450/depositphotos_163819640-stock-photo-white-package-template.jpg",
    "https://st2.depositphotos.com/1177973/11747/i/450/depositphotos_117473724-stock-photo-baby-accessories-for-hygiene.jpg",
    "https://st3.depositphotos.com/22341038/36599/i/450/depositphotos_365992192-stock-photo-baby-hygiene-accessories-white-background.jpg",
    "https://st3.depositphotos.com/1006269/18447/i/450/depositphotos_184474592-stock-photo-white-cd-dvd-mockup-template.jpg",
    "https://st.depositphotos.com/1050070/4529/i/450/depositphotos_45291197-stock-photo-set-of-aluminum-bags.jpg",
    "https://st3.depositphotos.com/1177973/14063/i/450/depositphotos_140636876-stock-photo-baby-diapers-in-wicker-basket.jpg",
    "https://st2.depositphotos.com/1177973/11747/i/450/depositphotos_117473688-stock-photo-baby-accessories-for-hygiene.jpg",
    "https://st3.depositphotos.com/22341038/36599/i/450/depositphotos_365993378-stock-photo-baby-hygiene-accessories-wooden-table.jpg",
    "https://st2.depositphotos.com/26964886/43674/i/450/depositphotos_436744174-stock-photo-baby-bottles-with-milk-and.jpg",
    "https://st3.depositphotos.com/28198014/35385/i/450/depositphotos_353850942-stock-photo-white-plastic-closed-bucket-isolated.jpg",
    "https://st3.depositphotos.com/1434993/17131/i/450/depositphotos_171314388-stock-photo-window-display-silver-material-stand.jpg",
    "https://st2.depositphotos.com/1177973/11747/i/450/depositphotos_117474208-stock-photo-baby-accessories-for-hygiene.jpg",
    "https://static8.depositphotos.com/1057266/1061/i/450/depositphotos_10614812-stock-photo-pumping-breast-milk.jpg",
    "https://st3.depositphotos.com/1177973/14063/i/450/depositphotos_140636866-stock-photo-baby-diapers-and-necessities.jpg",
    "https://st2.depositphotos.com/1006832/7161/i/450/depositphotos_71619483-stock-photo-mannequin-in-fashion-shop-display.jpg",
    "https://st3.depositphotos.com/1177973/14063/i/450/depositphotos_140636902-stock-photo-baby-diapers-and-necessities.jpg",
    "https://st2.depositphotos.com/1756291/9052/i/450/depositphotos_90526890-stock-photo-baby-feeding-pacifier-isolated-on.jpg",
    "https://st3.depositphotos.com/22341038/36599/i/450/depositphotos_365992050-stock-photo-flat-lay-baby-hygiene-accessories.jpg",
    "https://st2.depositphotos.com/41976406/86916/i/450/depositphotos_869169180-stock-photo-business-professional-presents-pacifier-concept.jpg",
]

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def download_image(url: str) -> bytes:
    logging.info("Downloading %s", url)
    resp = requests.get(url, stream=True, timeout=TIMEOUT)
    resp.raise_for_status()
    chunks = []
    for chunk in resp.iter_content(CHUNK_SIZE):
        if chunk:
            chunks.append(chunk)
    return b"".join(chunks), resp.headers.get("Content-Type")


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


def numeric_name_from_hash(content_bytes: bytes) -> str:
    # Deterministic 16-digit decimal derived from SHA256
    h = hashlib.sha256(content_bytes).hexdigest()
    num = int(h, 16) % (10 ** 16)
    return f"{num:016d}", h  # return zero-padded 16-digit string and full hex hash


def upload_to_s3(s3_client, content: bytes, bucket: str, key: str, content_type: str = None) -> str:
    extra_args = {"ACL": "public-read"}
    if content_type:
        extra_args["ContentType"] = content_type
    s3_client.put_object(Bucket=bucket, Key=key, Body=content, **extra_args)
    return f"https://{bucket}.s3.amazonaws.com/{key}"


def main():
    # deduplicate URL list preserving order
    seen_urls = set()
    urls = []
    for u in IMAGE_URLS:
        if u not in seen_urls:
            seen_urls.add(u)
            urls.append(u)

    s3 = boto3.client("s3")
    hash_to_url = {}
    output_urls = []

    for url in urls:
        try:
            content, content_type = download_image(url)
        except Exception as e:
            logging.error("Download failed for %s: %s", url, e)
            continue

        name16, full_hash = numeric_name_from_hash(content)

        # If we've already uploaded this content hash, reuse URL
        if full_hash in hash_to_url:
            logging.info("Duplicate content detected for %s, reusing existing URL", url)
            output_urls.append(hash_to_url[full_hash])
            continue

        # Determine extension: prefer content-type, fallback to URL extension, else .img
        ext = ext_from_content_type(content_type) or ext_from_url(url) or ".img"
        key = f"{PREFIX}/{name16}{ext}"

        try:
            public_url = upload_to_s3(s3, content, BUCKET, key, content_type)
        except Exception as e:
            logging.error("Upload failed for %s: %s", url, e)
            continue

        logging.info("Uploaded %s as %s", url, key)
        hash_to_url[full_hash] = public_url
        output_urls.append(public_url)

    # write unique URLs preserving order
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

    logging.info("Finished. %d unique images written to %s", len(unique), OUTPUT_FILE)


if __name__ == "__main__":
    main()
