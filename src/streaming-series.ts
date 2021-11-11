export namespace Series {
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

  export class LeibnizMadhavaPi extends Terms {
    /** not my favorite formula for pi, but it's nice and simple.
     *
     *  Nobody should be using this, it's only in here to have something
     *  easy to test the shared code with.
     *
     *  Note that we start at 0 for the series; the first few elements are
     *  thus:
     *
     *  f(0) = (0 % 2 == 0 ? 1 : -1) * 4 / (1 + 0 * 2) = 1 * 4 / 1 = 4
     *  f(1) = (1 % 2 == 0 ? 1 : -1) * 4 / (1 + 1 * 2) = -4 / 3
     *  f(2) = (2 % 2 == 0 ? 1 : -1) * 4 / (1 + 2 * 2) = 4 / 5
     *  f(3) = (3 % 2 == 0 ? 1 : -1) * 4 / (1 + 3 * 2) = -4 / 7
     *  ...
     *
     *  ... and so forth. Note that this formula is using 4 in the
     *  numerator to arrive at pi, as opposed to one of the other, common
     *  normalisations of the formula of the form 1/(...) = pi/4. This is
     *  easier on the floating point numbers in JS, and slightly better to
     *  test.
     */
    public async approximate(i: number): Promise<number> {
      return (i % 2 == 0 ?  1 : -1) * 4 / (1 + i * 2);
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

  export type BinaryOperator = (a: number, b: number) => number;
  export const Addition: BinaryOperator = (a: number, b: number): number => (a + b);
  export const Multiplication: BinaryOperator = (a: number, b: number): number => (a * b);

  export interface Series {
    readonly neutral?: number;
    readonly start?: number;
    readonly operator: BinaryOperator;

    get approximation(): number;
    get terms(): number;

    [Symbol.asyncIterator](): AsyncIterableIterator<number>;
  }

  export class OpSeries<T extends TermIterator> implements Series {
    constructor(public readonly term: T, public readonly operator: BinaryOperator, public readonly start?: number, public readonly neutral?: number) {}

    protected currentApproximation: number = this.start ?? this.neutral ?? 0;
    protected currentIndex: number = 0;

    get approximation(): number {
      return this.currentApproximation;
    }

    get terms(): number {
      return this.currentIndex;
    }

    nextTerm (term: number) {
      this.currentIndex++;
      this.currentApproximation = this.operator(this.currentApproximation, term);
    }

    async *[Symbol.asyncIterator]() {
      for await (const term of this.term) {
        this.nextTerm(term);

        yield this.currentApproximation;
      }
    }
  }

  export class Sum<T extends TermIterator> extends OpSeries<T> {
    constructor(term: T, start?: number) {
      super(term, Addition, start, 0);
    }
  }
  export class Product<T extends TermIterator> extends OpSeries<T> {
    constructor(term: T, start?: number) {
      super(term, Multiplication, start, 1);
    }
  }
}
