import { Series } from './streaming-series.js';

export namespace StdDev {
  export class Deviation<T extends Series.TermIterator> extends Series.OpSeries<T> {
    samples: number = 0;
    sum: number = 0;
    squared: number = 0;

    average: number = 0;
    median: number = 0;
    deviation: number = 0;

    constructor(term: T, start?: number) {
      super(term, (a: number, b: number): number => {
        this.samples++;
        this.sum += b;
        this.squared += b*b;

        this.average = this.sum / this.samples;

        this.deviation = Math.sqrt((this.samples * this.squared - this.sum * this.sum) / (this.samples * (this.samples - 1)));

        return this.deviation;
      }, start);
    }
  }
}
