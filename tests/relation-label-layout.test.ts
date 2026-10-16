import { describe, expect, it } from 'vitest';
import { layoutRelationLabels, type RelationLabelObstacle } from '../src/ui/relationGraphLabels';

describe('relation label geometry', () => {
  it('keeps nearby and overflow slots, padding and canvas extents deterministic', () => {
    const labels = Array.from({ length: 6 }, (_, i) => ({ id: String(i), x: 120, y: 100, width: 80 }));
    const layout = layoutRelationLabels(labels, [{ left: 40, top: 74, right: 200, bottom: 126 }]);
    expect([...layout.labels.values()]).toEqual([28, 172, 244, 281, 318, 355].map(y => ({ x: 120, y, width: 80 })));
    expect(layout.width).toBe(204);
    expect(layout.height).toBe(367);
  });

  it('keeps every dense label clear of all nodes and labels without mutating inputs', () => {
    const nodes = Array.from({ length: 60 }, (_, i) => Object.freeze({ left: 40 + i % 4 * 220, top: 74 + Math.floor(i / 4) * 120, right: 200 + i % 4 * 220, bottom: 126 + Math.floor(i / 4) * 120 }));
    const labels = Array.from({ length: 300 }, (_, i) => Object.freeze({ id: String(i), x: 120 + i % 4 * 220, y: 100 + Math.floor(i % 60 / 4) * 120, width: 44 + i % 13 * 12 }));
    const layout = layoutRelationLabels(Object.freeze(labels), Object.freeze(nodes));
    expect([...layout.labels.keys()]).toEqual(labels.map(label => label.id));
    const occupied: RelationLabelObstacle[] = [...nodes];
    for (const position of layout.labels.values()) {
      const box = { left: position.x - position.width / 2, top: position.y - 20, right: position.x + position.width / 2, bottom: position.y + 8 };
      expect(box.left).toBeGreaterThanOrEqual(4);
      expect(box.top).toBeGreaterThanOrEqual(4);
      expect(box.right + 4).toBeLessThanOrEqual(layout.width);
      expect(box.bottom + 4).toBeLessThanOrEqual(layout.height);
      for (const other of occupied) {
        expect(box.right + 8 < other.left || box.left - 8 > other.right || box.bottom + 8 < other.top || box.top - 8 > other.bottom).toBe(true);
      }
      occupied.push(box);
    }
  });
});
