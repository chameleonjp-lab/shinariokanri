"""Verify a closed evidence packet without running its captured code or contacting a server."""
import argparse
import hashlib
import io
import json
import pathlib
import re
import shutil
import tarfile


def safe_relative(value):
    path = pathlib.PurePosixPath(value)
    if not value or path.is_absolute() or str(path) != value or any(
        part in ('', '.', '..') or '\\' in part or ':' in part for part in path.parts
    ):
        raise ValueError(f'Unsafe evidence path: {value!r}')
    return path


def digest_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(2 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


class Parts(io.RawIOBase):
    def __init__(self, paths):
        self.paths = iter(paths)
        self.current = None

    def readable(self):
        return True

    def readinto(self, buffer):
        while True:
            if self.current is None:
                try:
                    self.current = next(self.paths).open('rb')
                except StopIteration:
                    return 0
            count = self.current.readinto(buffer)
            if count:
                return count
            self.current.close()
            self.current = None

    def close(self):
        if self.current is not None:
            self.current.close()
        super().close()


def verify(directory, materialize=None):
    manifest_path = directory / 'MANIFEST.json'
    if manifest_path.is_symlink() or manifest_path.stat().st_size > 64 * 1024 * 1024:
        raise ValueError('Invalid evidence manifest size/type')
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest['layout'] != 'content-addressed-blobs':
        raise ValueError('Unsupported evidence layout')
    expected = {}
    logical = set()
    for row in manifest['files']:
        path = safe_relative(row['path'])
        if path.parts[0] == 'blobs':
            raise ValueError('Logical evidence path collides with blob staging')
        if row['path'] in logical:
            raise ValueError('Duplicate logical evidence path')
        logical.add(row['path'])
        if not re.fullmatch(r'[0-9a-f]{64}', row['sha256']) or row['blob'] != 'blobs/' + row['sha256']:
            raise ValueError('Invalid content-addressed evidence entry')
        if not isinstance(row['bytes'], int) or row['bytes'] < 0:
            raise ValueError('Invalid evidence byte count')
        previous = expected.setdefault(row['blob'], row)
        if previous['bytes'] != row['bytes']:
            raise ValueError('Conflicting evidence blob byte counts')
    for value in logical:
        for ancestor in safe_relative(value).parents:
            if str(ancestor) in logical:
                raise ValueError('Logical evidence paths have a file/descendant collision')
    if len(logical) != manifest['logicalFileCount'] or len(expected) != manifest['uniqueBlobCount']:
        raise ValueError('Evidence file counts differ from manifest')
    if sum(row['bytes'] for row in manifest['files']) != manifest['logicalBytes']:
        raise ValueError('Logical evidence byte total differs')
    joined = hashlib.sha256()
    total = 0
    paths = []
    for index, row in enumerate(manifest['parts'], 1):
        if row['path'] != f'evidence.tar.gz.part-{index:02d}':
            raise ValueError('Evidence parts are missing or reordered')
        path = directory / row['path']
        if path.is_symlink() or path.stat().st_size != row['bytes']:
            raise ValueError('Evidence part size/type differs')
        digest = hashlib.sha256()
        with path.open('rb') as stream:
            while chunk := stream.read(2 * 1024 * 1024):
                digest.update(chunk)
                joined.update(chunk)
                total += len(chunk)
        if digest.hexdigest() != row['sha256']:
            raise ValueError(f'Evidence part hash differs: {row["path"]}')
        paths.append(path)
    if total != manifest['archiveBytes'] or joined.hexdigest() != manifest['archiveSHA256']:
        raise ValueError('Joined evidence archive differs')
    if materialize is not None:
        if materialize.exists():
            raise ValueError('Materialization requires a new empty destination')
        materialize.mkdir(parents=True)
    found = set()
    embedded = None
    with io.BufferedReader(Parts(paths)) as joined_stream:
        with tarfile.open(fileobj=joined_stream, mode='r|gz') as archive:
            for member in archive:
                if not member.isfile():
                    raise ValueError('Evidence archive contains a link or non-file member')
                stream = archive.extractfile(member)
                if stream is None:
                    raise ValueError('Cannot read evidence member')
                if member.name == 'ARCHIVE_MANIFEST.json':
                    # The complete logical-file ledger can exceed 16 MiB.
                    # Embedded metadata remains bounded by the external ledger
                    # already read above; this is not a product import quota.
                    if embedded is not None or member.size > len(manifest_bytes):
                        raise ValueError('Invalid embedded manifest')
                    embedded = json.loads(stream.read())
                    continue
                if member.name not in expected or member.name in found:
                    raise ValueError('Unexpected or duplicate evidence blob')
                row = expected[member.name]
                if member.size != row['bytes']:
                    raise ValueError('Evidence blob size differs')
                digest = hashlib.sha256()
                output = None
                try:
                    if materialize is not None:
                        path = materialize / member.name
                        path.parent.mkdir(parents=True, exist_ok=True)
                        output = path.open('xb')
                    while chunk := stream.read(2 * 1024 * 1024):
                        digest.update(chunk)
                        if output is not None:
                            output.write(chunk)
                finally:
                    if output is not None:
                        output.close()
                if digest.hexdigest() != row['sha256']:
                    raise ValueError('Evidence blob hash differs')
                found.add(member.name)
    if found != set(expected) or embedded is None:
        raise ValueError('Evidence archive is incomplete')
    for key in ('targetProduct', 'layout', 'files', 'logicalFileCount', 'uniqueBlobCount', 'logicalBytes', 'procedureSHA256', 'scope'):
        if embedded.get(key) != manifest.get(key):
            raise ValueError(f'Embedded evidence manifest differs: {key}')
    if materialize is not None:
        for row in manifest['files']:
            path = materialize / row['path']
            path.parent.mkdir(parents=True, exist_ok=True)
            with (materialize / row['blob']).open('rb') as source, path.open('xb') as destination:
                shutil.copyfileobj(source, destination, 2 * 1024 * 1024)
    return {'result': 'bytes_verified', 'targetProduct': manifest['targetProduct'], 'logicalFiles': len(logical), 'uniqueBlobs': len(found), 'archiveBytes': total, 'materialized': materialize is not None, 'acceptancePassInferred': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=pathlib.Path)
    parser.add_argument('--materialize', type=pathlib.Path)
    arguments = parser.parse_args()
    print(json.dumps(verify(arguments.directory, arguments.materialize), ensure_ascii=False))
