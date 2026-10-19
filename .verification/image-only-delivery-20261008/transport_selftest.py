"""Small negative fixtures for transport budget and archive identity."""

import json
import unittest
from unittest.mock import patch

import remote_transport as transport


class Result:
    returncode = 0
    stdout = json.dumps("/var/lib/docker").encode()
    stderr = b""


class Stat:
    def __init__(self, free, device):
        self.f_bavail = free
        self.f_frsize = 1024
        self.st_dev = device


class TransportTests(unittest.TestCase):
    def test_archive_hash_is_canonical_64_hex(self):
        self.assertEqual(len(transport.ARCHIVE_SHA), 64)
        self.assertEqual(transport.ARCHIVE_BYTES, 606022656)

    def test_same_filesystem_requires_archive_and_load_headroom(self):
        with patch.object(transport.subprocess, "run", return_value=Result()), \
                patch.object(transport.os, "statvfs", side_effect=[Stat(3000000, 1), Stat(3000000, 1)]), \
                patch.object(transport.os, "stat", return_value=Stat(3000000, 1)):
            budget = transport.filesystem_budget("load")
        self.assertTrue(budget["sameFilesystem"])
        self.assertEqual(budget["requiredSrvKiB"], budget["requiredDockerKiB"])
        self.assertGreater(budget["requiredSrvKiB"], transport.ARCHIVE_KIB * 3)

    def test_separate_docker_filesystem_can_stop(self):
        with patch.object(transport.subprocess, "run", return_value=Result()), \
                patch.object(transport.os, "statvfs", side_effect=[Stat(3000000, 1), Stat(100000, 2)]), \
                patch.object(transport.os, "stat", side_effect=[Stat(3000000, 1), Stat(100000, 2)]):
            with self.assertRaisesRegex(RuntimeError, "InsufficientTransportSpace"):
                transport.filesystem_budget("load")


if __name__ == "__main__":
    unittest.main()
