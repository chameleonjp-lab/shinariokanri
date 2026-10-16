import type Dexie from 'dexie';
import type { DBCore } from 'dexie';
import { PROBE_TABLES, probeEnabled, probeCount, probeCounter, probePayload, probeTransaction, type ProbeTable } from './probe';

/** Below record-parts decoding. Counts native DBCore rows, including parts and
 * internal reads; direct IDB keep-alive requests and physical disk bytes are excluded. */
export function installDatabaseProbe(db: Dexie) {
  db.use({ stack: 'dbcore', name: 'scenario-numeric-probe', level: -3, create(down: DBCore): DBCore {
    const transactions = new WeakMap<object, { writes: Map<ProbeTable, number> }>();
    return { ...down, table(name) {
      const table = down.table(name);
      if (!(PROBE_TABLES as readonly string[]).includes(name)) return table;
      const tableName = name as ProbeTable;
      const read = (rows: unknown[], values: boolean) => {
        probeCount('db.read.calls', 1, tableName);
        probeCount(values ? 'db.read.rows' : 'db.read.keys', rows.filter(value => value !== undefined).length, tableName);
        if (values) probePayload('db.read.payloadBytes', rows, tableName);
      };
      return { ...table,
        get(req) { if (!probeEnabled()) return table.get(req); probeCount('db.read.requested', 1, tableName); return table.get(req).then(value => { read(value === undefined ? [] : [value], true); return value; }); },
        getMany(req) { if (!probeEnabled()) return table.getMany(req); probeCount('db.read.requested', req.keys.length, tableName); return table.getMany(req).then(rows => { read(rows, true); return rows; }); },
        query(req) { if (!probeEnabled()) return table.query(req); return table.query(req).then(result => { read(result.result, !!req.values); return result; }); },
        mutate(req) {
          if (!probeEnabled()) return table.mutate(req);
          const count = probeCounter();
          const attempted = req.type === 'add' || req.type === 'put' ? req.values.length : req.type === 'delete' ? req.keys.length : 0;
          count('db.write.calls', 1, tableName); count('db.write.attempted', attempted, tableName);
          if (req.type === 'deleteRange') count('db.deleteRange.calls', 1, tableName);
          if (req.type === 'add' || req.type === 'put') probePayload('db.write.payloadBytes', req.values, tableName);
          let transaction = transactions.get(req.trans);
          if (!transaction) {
            transaction = { writes: new Map() }; transactions.set(req.trans, transaction);
            const writes = transaction.writes, native = req.trans as IDBTransaction, barrier = probeTransaction();
            // Browser microtask checkpoints may resolve Dexie's public promise
            // before later native listeners. The research caller can settle the
            // observation without adding any await to application persistence.
            native.addEventListener('complete', () => { count('db.transaction.committed'); for (const [table, rows] of writes) count('db.write.committed', rows, table); barrier.finish(); }, { once: true });
            native.addEventListener('abort', () => { count('db.transaction.aborted'); for (const [table, rows] of writes) count('db.write.aborted', rows, table); barrier.finish(); }, { once: true });
          }
          const writes = transaction.writes;
          return table.mutate(req).then(result => {
            const succeeded = Math.max(0, attempted - result.numFailures);
            count('db.write.succeeded', succeeded, tableName); writes.set(tableName, (writes.get(tableName) ?? 0) + succeeded);
            return result;
          });
        },
      };
    } };
  } });
}
