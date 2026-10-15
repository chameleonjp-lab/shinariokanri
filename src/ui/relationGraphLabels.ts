export interface RelationLabelPosition { x: number; y: number; width: number }
export interface RelationLabelInput extends RelationLabelPosition { id: string }
export interface RelationLabelObstacle { left: number; top: number; right: number; bottom: number }

// Display geometry only. The original nodes, lines, and stored layout are inputs.
export function layoutRelationLabels(inputs: readonly RelationLabelInput[], nodes: readonly RelationLabelObstacle[]) {
  const gap = 4, cellWidth = 128, cellHeight = 32, nearbyAttempts = 9, nearbyStep = 36;
  const buckets = new Map<number, Map<number, RelationLabelObstacle[]>>();
  const labels = new Map<string, RelationLabelPosition>();
  let width = 0, height = 0, overflowBottom = 0;
  const padded = (box: RelationLabelObstacle): RelationLabelObstacle => ({ left: box.left - gap, top: box.top - gap, right: box.right + gap, bottom: box.bottom + gap });
  const reserve = (box: RelationLabelObstacle) => {
    width = Math.max(width, box.right + gap); height = Math.max(height, box.bottom + gap);
    const obstacle = padded(box);
    for (let row = Math.floor(obstacle.top / cellHeight); row <= Math.floor(obstacle.bottom / cellHeight); row++) {
      let columns = buckets.get(row);
      if (!columns) { columns = new Map(); buckets.set(row, columns); }
      for (let column = Math.floor(obstacle.left / cellWidth); column <= Math.floor(obstacle.right / cellWidth); column++) {
        const items = columns.get(column);
        if (items) items.push(obstacle); else columns.set(column, [obstacle]);
      }
    }
  };
  const collides = (box: RelationLabelObstacle) => {
    const candidate = padded(box);
    for (let row = Math.floor(candidate.top / cellHeight); row <= Math.floor(candidate.bottom / cellHeight); row++) {
      const columns = buckets.get(row);
      if (!columns) continue;
      for (let column = Math.floor(candidate.left / cellWidth); column <= Math.floor(candidate.right / cellWidth); column++) {
        // An obstacle may occur in several cells. Repeating its pure numeric
        // overlap check avoids allocating a Set for every nearby candidate.
        for (const obstacle of columns.get(column) ?? []) {
          if (candidate.left <= obstacle.right && candidate.right >= obstacle.left && candidate.top <= obstacle.bottom && candidate.bottom >= obstacle.top) return true;
        }
      }
    }
    return false;
  };
  for (const node of nodes) { reserve(node); overflowBottom = Math.max(overflowBottom, node.bottom); }
  // Every overflow slot lies below all nodes and every bounded nearby candidate.
  for (const input of inputs) overflowBottom = Math.max(overflowBottom, input.y + 8 + Math.floor(nearbyAttempts / 2) * nearbyStep);
  let nextOverflowY = overflowBottom + 2 * gap + 21;
  const boxOf = (position: RelationLabelPosition): RelationLabelObstacle => ({ left: position.x - position.width / 2, top: position.y - 20, right: position.x + position.width / 2, bottom: position.y + 8 });
  for (const input of inputs) {
    const x = Math.max(input.width / 2 + gap, input.x);
    let position: RelationLabelPosition | undefined;
    for (let attempt = 0; attempt < nearbyAttempts; attempt++) {
      const offset = attempt === 0 ? 0 : Math.ceil(attempt / 2) * nearbyStep * (attempt % 2 ? -1 : 1);
      const candidate = { x, y: input.y + offset, width: input.width };
      if (candidate.y < 20 + gap || collides(boxOf(candidate))) continue;
      position = candidate; break;
    }
    if (!position) {
      position = { x, y: nextOverflowY, width: input.width };
      nextOverflowY += 28 + 2 * gap + 1;
    }
    labels.set(input.id, position); reserve(boxOf(position));
  }
  return { labels, width, height };
}
