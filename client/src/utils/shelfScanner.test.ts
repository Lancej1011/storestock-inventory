import { describe, it, expect } from 'vitest';
import { ObjectTracker } from './shelfScanner';

describe('ObjectTracker', () => {
  it('should assign unique IDs to new detections', () => {
    const tracker = new ObjectTracker();
    const detections: any[] = [
      { bbox: [10, 10, 50, 50], class: 'bottle', score: 0.9 },
      { bbox: [100, 100, 50, 50], class: 'bottle', score: 0.8 },
    ];

    const tracked = tracker.track(detections);
    expect(tracked).toHaveLength(2);
    expect(tracked[0].id).toBe('obj-1');
    expect(tracked[1].id).toBe('obj-2');
  });

  it('should maintain IDs for objects that move slightly', () => {
    const tracker = new ObjectTracker();

    // Frame 1
    tracker.track([{ bbox: [10, 10, 50, 50], class: 'bottle', score: 0.9 } as any]);

    // Frame 2 - Moved slightly (10,10 -> 15,15)
    const tracked = tracker.track([{ bbox: [15, 15, 50, 50], class: 'bottle', score: 0.9 } as any]);

    expect(tracked).toHaveLength(1);
    expect(tracked[0].id).toBe('obj-1'); // Maintains ID
  });

  it('should assign fresh IDs to objects far away', () => {
    const tracker = new ObjectTracker();

    // Frame 1
    tracker.track([{ bbox: [10, 10, 50, 50], class: 'bottle', score: 0.9 } as any]);

    // Frame 2 - Far away (10,10 -> 200,200) - threshold is ~40px so this should get new ID
    const tracked = tracker.track([{ bbox: [200, 200, 50, 50], class: 'bottle', score: 0.9 } as any]);

    expect(tracked).toHaveLength(1);
    expect(tracked[0].id).toBe('obj-2'); // Gets new ID
  });

  it('should count multiple identical products correctly', () => {
    const tracker = new ObjectTracker();
    const detections: any[] = [
      { bbox: [10, 10, 50, 50], class: 'bottle', score: 0.9 },
      { bbox: [70, 10, 50, 50], class: 'bottle', score: 0.9 },
      { bbox: [130, 10, 50, 50], class: 'bottle', score: 0.9 },
    ];

    const tracked = tracker.track(detections);
    expect(tracked).toHaveLength(3);
    const uniqueIds = new Set(tracked.map(t => t.id));
    expect(uniqueIds.size).toBe(3); // 3 unique object IDs
  });

  it('should filter out non-product classes', () => {
    const tracker = new ObjectTracker();
    const detections: any[] = [
      { bbox: [10, 10, 50, 50], class: 'person', score: 0.9 },
      { bbox: [100, 100, 50, 50], class: 'bottle', score: 0.8 },
      { bbox: [200, 200, 50, 50], class: 'car', score: 0.7 },
    ];

    const tracked = tracker.track(detections);
    expect(tracked).toHaveLength(1);
    expect(tracked[0].class).toBe('bottle');
  });

  it('should use tracked ID from previous frame', () => {
    const tracker = new ObjectTracker();

    // Frame 1
    const frame1 = tracker.track([{ bbox: [10, 10, 50, 50], class: 'bottle', score: 0.9 } as any]);
    expect(frame1[0].id).toBe('obj-1');

    // Frame 2 - same position, same class
    const frame2 = tracker.track([{ bbox: [10, 10, 50, 50], class: 'bottle', score: 0.9 } as any]);
    expect(frame2[0].id).toBe('obj-1'); // Same ID
    expect(frame2[0].trackedId).toBe('obj-1');
  });
});
