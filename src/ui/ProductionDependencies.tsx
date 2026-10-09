import type { Entity } from '../domain/types';

/** The diagram uses the same paged task set as the complete, keyboard-accessible list. */
export function ProductionDependencies({ tasks, onOpen }: { tasks: Entity<'production_task'>[]; onOpen: (id: string) => void }) {
  const positions = new Map(tasks.map((task, index) => [task.id, 30 + index * 58]));
  const edges = tasks.flatMap(task => (task.data.dependsOn ?? []).flatMap(id => positions.has(id) ? [{ from: id, to: task.id }] : []));
  return <details className="settings-card"><summary>制作依存図・現在のページ {tasks.length}件</summary>
    <div style={{ maxHeight: '32rem', overflow: 'auto' }}><svg role="img" aria-label="制作タスクの先行関係" viewBox={`0 0 620 ${Math.max(80, tasks.length * 58 + 20)}`} style={{ width: '100%', minWidth: 320 }}>
      <defs><marker id="production-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>
      {edges.slice(0, 120).map((edge, index) => <path key={`${edge.from}:${edge.to}`} d={`M 150 ${positions.get(edge.from)} C ${20 + index % 8 * 10} ${positions.get(edge.from)}, ${20 + index % 8 * 10} ${positions.get(edge.to)}, 150 ${positions.get(edge.to)}`} fill="none" stroke="currentColor" markerEnd="url(#production-arrow)"><title>{tasks.find(task => task.id === edge.from)?.name} → {tasks.find(task => task.id === edge.to)?.name}</title></path>)}
      {tasks.map(task => <g key={task.id}><rect x="150" y={positions.get(task.id)! - 19} width="440" height="38" rx="8" fill="var(--surface, white)" stroke="currentColor"/><text x="164" y={positions.get(task.id)! + 5} fill="currentColor">{task.name.slice(0, 28)} · {task.data.stage}/{task.data.progress}</text></g>)}
    </svg></div>
    {edges.length > 120 && <p>図は先頭120接続を表示。全先行関係は各タスクの一覧から確認できます。</p>}
    <p>別ページの先行作業は下の対象リンクから開けます。図の省略は依存完了を意味しません。</p>
    {tasks.map(task => <p key={task.id}><button onClick={() => onOpen(task.id)}>{task.name}</button>{(task.data.dependsOn ?? []).map(id => <button key={id} onClick={() => onOpen(id)}>先行 {tasks.find(target => target.id === id)?.name ?? '別ページの作業'}</button>)}</p>)}
  </details>;
}
