#!/usr/bin/env python3
"""Proxy-aware wrapper around the official `overturemaps` CLI.

Two sandbox/CI problems solved here:
 1. The CLI discovers releases via a STAC catalog endpoint that corporate
    proxies often block. We pre-seed the module's catalog cache with the
    release we want (OVERTURE_RELEASE env, default pinned below).
 2. pyarrow's S3FileSystem does not read HTTPS_PROXY from the environment;
    we inject it via its explicit `proxy_options` parameter.

Usage: overture_fetch.py download --bbox=... -f geojson --type=building -o out.geojson
(identical arguments to `overturemaps`; --release is appended automatically)
"""

import os
import sys

import pyarrow.fs as pafs

RELEASE = os.environ.get("OVERTURE_RELEASE", "2026-06-17.0")

_proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
_orig_s3 = pafs.S3FileSystem


def _patched_s3(*args, **kwargs):
    if _proxy and "proxy_options" not in kwargs:
        kwargs["proxy_options"] = _proxy
    return _orig_s3(*args, **kwargs)


pafs.S3FileSystem = _patched_s3

from overturemaps import core  # noqa: E402  (import after patch on purpose)

core.fs.S3FileSystem = _patched_s3
core._cached_stac_catalog = {
    "latest": RELEASE,
    "links": [{"rel": "child", "href": f"./{RELEASE}/catalog.json"}],
}

from overturemaps.cli import cli  # noqa: E402

if __name__ == "__main__":
    argv = sys.argv[1:]
    if "download" in argv and not any(a.startswith("--release") for a in argv):
        argv = argv + [f"--release={RELEASE}"]
    cli(argv)
