import { expect, it } from 'vitest';
import { createMaterialPerformanceFixture, createPerformanceFixture } from '../../src/testing/performanceFixture';
import { studyFixtureIdentity } from '../../scripts/optimization/fixtureIdentity';

it('keeps the original Standard insertion-order digest and byte identity', async () => {
  const fixture = await createPerformanceFixture('standard-r06-v1');
  const identity = await studyFixtureIdentity(fixture);
  expect(identity.sha256).toBe('de0b9420abec95bcc37fc7fb7c3dc4c2667082258678f750af33bb53f8a557f5');
  expect(identity.wireJsonSha256).toBe(identity.sha256);
  fixture.project.name += 'changed'; await expect(studyFixtureIdentity(fixture)).rejects.toThrow(/fixture/);
});

it('keeps the original Large canonical digest separately from insertion-order JSON and real 72MiB assets', async () => {
  const fixture = await createMaterialPerformanceFixture('large-material-rb10-v1');
  expect(fixture.assetBytes).toBe(75_497_472); expect(fixture.counts.totalRecords).toBe(88_003);
  const identity = await studyFixtureIdentity(fixture);
  expect(identity.sha256).toBe('814daf96a6511cf47409f3497b03c7ba0309af250bfd87306c44a1dec5d5a917');
  expect(identity.wireJsonSha256).toBe('32e7995933c9e0ca6af2330df1036d0c182ad34810d41e45b0a9530d42998f4f');
  expect(identity.jsonBytes).toBe(59_407_368);
});
