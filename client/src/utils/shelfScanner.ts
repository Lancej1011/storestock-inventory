// @ts-ignore
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

let model: cocoSsd.ObjectDetection | null = null;

export async function loadShelfModel() {
  if (!model) {
    console.log('Loading COCO-SSD model...');
    model = await cocoSsd.load();
    console.log('COCO-SSD model loaded');
  }
  return model;
}

export interface DetectedObject {
  id: string;
  bbox: [number, number, number, number]; // [x, y, width, height]
  class: string;
  score: number;
  productMatch?: any;
}

// Simple tracker to maintain identity across frames
class ObjectTracker {
  private lastDetections: DetectedObject[] = [];
  private nextId = 1;

  track(newDetections: cocoSsd.DetectedObject[]): DetectedObject[] {
    const tracked: DetectedObject[] = [];
    
    for (const det of newDetections) {
      if (det.class !== 'bottle' && det.class !== 'cup' && det.class !== 'box') {
        // In a real retail env, we'd map COCO classes to generic product shapes
        // For now, allow common product-like shapes
      }

      // Try to find a match in lastDetections based on proximity
      let matched = false;
      for (const last of this.lastDetections) {
        if (this.isClose(det.bbox, last.bbox)) {
          tracked.push({
            id: last.id,
            bbox: det.bbox as [number, number, number, number],
            class: det.class,
            score: det.score
          });
          matched = true;
          break;
        }
      }

      if (!matched) {
        tracked.push({
          id: `product-${this.nextId++}`,
          bbox: det.bbox as [number, number, number, number],
          class: det.class,
          score: det.score
        });
      }
    }

    this.lastDetections = tracked;
    return tracked;
  }

  private isClose(bbox1: any, bbox2: any): boolean {
    const [x1, y1] = bbox1;
    const [x2, y2] = bbox2;
    const dist = Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
    return dist < 50; // threshold for same object
  }
}

const tracker = new ObjectTracker();

export async function detectProducts(video: HTMLVideoElement): Promise<DetectedObject[]> {
  const m = await loadShelfModel();
  const detections = await m.detect(video);
  return tracker.track(detections);
}
