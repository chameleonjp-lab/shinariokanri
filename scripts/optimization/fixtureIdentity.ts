import { jsonBytes, sha256 } from '../../src/storage/json';
import type { PerformanceFixture } from '../../src/testing/performanceFixture';
export async function studyFixtureIdentity(fixture: PerformanceFixture) {
  const wire = new TextEncoder().encode(JSON.stringify(fixture.project)), wireJsonSha256 = await sha256(wire);
  // Preserve the two existing generator contracts; never relabel an insertion-order hash as canonical.
  const digest = fixture.size === 'large' ? await sha256(jsonBytes(fixture.project)) : wireJsonSha256;
  if (digest !== fixture.sha256) throw new Error('Original fixture digest differs');
  return { sha256: digest, wireJsonSha256, jsonBytes: wire.byteLength };
}
