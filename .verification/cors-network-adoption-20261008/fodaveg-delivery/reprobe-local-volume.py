"""Exact local-volume constructor for the forthcoming owned TEST reprobe.

This module builds an argv only. Creation requires the TEST protocol's persisted
intent, fresh allocator budget and separate execution grant; it does no I/O.
"""
import re

NONCE = re.compile(r"[0-9a-f]{32}\Z")


def volume_create_argv(nonce, owner):
    """Select the built-in local allocator explicitly, without driver options."""
    if not isinstance(nonce, str) or not NONCE.fullmatch(nonce):
        raise ValueError("TestIdentityUnknown")
    if not isinstance(owner, str) or not re.fullmatch(r"fodaveg-reprobe-[0-9]{8}T[0-9]{6}Z-[0-9]{1,10}", owner):
        raise ValueError("TestIdentityUnknown")
    return ["docker", "volume", "create", "--driver", "local",
            "--label", "vega.fod.reprobe=" + owner,
            "--label", "vega.fod.nonce=" + nonce,
            "vega-fod-reprobe-" + nonce]
