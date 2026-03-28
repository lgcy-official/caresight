import { EventEmitter } from 'events';
import type { SurveillanceEvent } from '@/lib/types';

class SurveillanceEventBus extends EventEmitter {
  private static instance: SurveillanceEventBus;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): SurveillanceEventBus {
    if (!SurveillanceEventBus.instance) {
      SurveillanceEventBus.instance = new SurveillanceEventBus();
    }
    return SurveillanceEventBus.instance;
  }

  emit(event: 'surveillance', data: SurveillanceEvent): boolean {
    return super.emit(event, data);
  }

  on(event: 'surveillance', listener: (data: SurveillanceEvent) => void): this {
    return super.on(event, listener);
  }

  off(event: 'surveillance', listener: (data: SurveillanceEvent) => void): this {
    return super.off(event, listener);
  }

  publish(data: SurveillanceEvent): void {
    this.emit('surveillance', data);
  }
}

export const eventBus = SurveillanceEventBus.getInstance();
