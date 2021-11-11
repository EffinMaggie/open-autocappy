export namespace Streaming {
  export interface TermIterator extends AsyncIterable<number> {
    [Symbol.asyncIterator](): AsyncIterableIterator<number>;
  }

  export class Terms implements TermIterator {
    protected referenced = new Map<number, Promise<number> | number>();

    // overwrite this function for custom series
    public async approximate(i: number): Promise<number> {
      return i;
    }

    public at = async (i: number): Promise<number> => {
      const promise = this.referenced.get(i);

      if (promise !== undefined) {
        return promise;
      }

      this.referenced.set(i, new Promise<number>(async (resolve, reject) => {
        const approx = await this.approximate(i);
        this.referenced.set(i, approx);

        resolve(approx);
      }));

      // recurse to return the new promise
      return this.at(i);
    }

    async *[Symbol.asyncIterator](from: number = 0, to?: number) {
      for (let i = from; to === undefined || i < to; i++) {
        const approx = this.at(i);

        if (typeof approx === 'number') {
          yield approx;
        } else {
          yield await approx;
        }
      }
    }
  }

  export class Sampled implements TermIterator {
    constructor(
      protected readonly bias: number[] = [],
      protected window: number = 10) { this.reset(); }

    protected samples: number[] = [];
    protected resolve: undefined | ((i: number) => void) = undefined;
    protected next: Promise<number>;
    protected reset = () => {
      // create a pending Promise
      this.next = new Promise<number>(() => {});
    }

    public approximate = (i: number) => new Promise<number>(async (resolve) => {
      if (i < this.bias.length) {
        resolve(this.bias[i]);
      }

      i -= this.bias.length;
      if (i < this.samples.length) {
        resolve(this.samples[i]);
      }

      const sample = await this.next;
      resolve (sample);
    });

    async *[Symbol.asyncIterator](from: number = 0, to?: number) {
      for (let i = from; to === undefined || i < to; i++) {
        yield await this.approximate(i);
      }
    }

    public sample(s: number) {
      this.samples.push(s);

      while (this.samples.length > this.window) {
        this.samples.shift();
      }

      const resolve = this.resolve;
      if (resolve !== undefined) {
        console.warn(this.resolve);
        this.resolve = undefined;
        resolve(s);
        this.next.then(() => this.reset());
      }
    }
  }

  export interface Series<T extends TermIterator> {
    get approximation(): number;

    [Symbol.asyncIterator](): AsyncIterableIterator<number>;
  }

  export class Sum<T extends TermIterator> implements Series<T> {
    constructor(public term: T, protected readonly start: number) {}

    protected currentApproximation: number = this.start;
    protected currentIndex: number = 0;

    get approximation(): number {
      return this.currentApproximation;
    }

    get terms(): number {
      return this.currentIndex;
    }

    async *[Symbol.asyncIterator]() {
      for await (const term of this.term) {
        this.currentIndex++;
        this.currentApproximation += term;

        yield this.currentApproximation;
      }
    }
  }
}
