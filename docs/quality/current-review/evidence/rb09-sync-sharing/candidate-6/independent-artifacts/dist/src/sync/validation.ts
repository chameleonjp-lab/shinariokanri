import { assertAckEnvelope, sameValue, SyncProtocolError, type SyncAck, type SyncOperation } from './protocol';
import { threeWayMerge } from './merge';

/** An HTTP success or a matching operation ID alone is never evidence that an edit was applied. */
export async function assertAck(operation: SyncOperation, ack: SyncAck): Promise<void> {
  await assertAckEnvelope(operation, ack);
  const expectedConflicts = [];
  for (const [index, target] of operation.targets.entries()) {
    const document = ack.documents[index];
    const merged = threeWayMerge(target.base, target.local, document);
    if (ack.status === 'applied') {
      if (merged.status !== 'merged' || !document || !sameValue(
        { fields: merged.document.fields, tombstone: merged.document.tombstone },
        { fields: document.fields, tombstone: document.tombstone },
      )) throw new SyncProtocolError('PROTOCOL_INVALID');
    } else if (merged.status === 'conflict') expectedConflicts.push(merged.conflict);
  }
  if (ack.status === 'conflict' && !sameValue(ack.conflicts, expectedConflicts)) {
    throw new SyncProtocolError('PROTOCOL_INVALID');
  }
}
