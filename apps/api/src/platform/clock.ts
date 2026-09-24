import { Injectable } from '@nestjs/common';

/** Horloge injectable : permet de tester quiet hours, rappels et échéances sans attendre. */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}

/** Horloge figée pour les tests. */
export class FixedClock extends Clock {
  constructor(private current: Date) {
    super();
  }
  override now(): Date {
    return new Date(this.current);
  }
  set(date: Date | string): void {
    this.current = new Date(date);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
