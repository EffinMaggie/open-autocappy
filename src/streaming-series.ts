/** @format */

export namespace Series {
  export interface TermIterable extends Iterable<number>, AsyncIterable<number> {
    at(i: number): number | undefined;
  }

  export class Terms implements TermIterable {
    *[Symbol.iterator](): Generator<number> {
      for (let i = 0; true; i++) {
        const term = this.at(i);
        if (term === undefined) {
          continue;
        }

        yield term;
      }
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<number> {
      for (let i = 0; true; i++) {
        const term = this.at(i);
        if (term === undefined) {
          continue;
        }

        yield term;
      }
    }

    // overwrite this function to implement series
    public at(i: number): number | undefined {
      return i;
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
    public at(i: number): number {
      return ((i % 2 == 0 ? 1 : -1) * 4) / (1 + i * 2);
    }
  }

  export class Sampled implements TermIterable {
    *[Symbol.iterator](): Generator<number> {
      for (let i = 0; i < this.length; i++) {
        const term = this.at(i);
        if (term === undefined) {
          continue;
        }

        yield term;
      }
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<number> {
      for (let i = 0; i < this.length; i++) {
        const term = this.at(i);
        if (term === undefined) {
          continue;
        }

        yield term;
      }
    }

    protected get length(): number {
      return this.bias.length + this.samples.length;
    }

    constructor(protected readonly bias: number[] = [], protected window: number = 10) {}

    protected samples: number[] = [];

    public at(i: number): number | undefined {
      if (i < this.bias.length) {
        return this.bias[i];
      }

      i -= this.bias.length;
      if (i < this.samples.length) {
        return this.samples[i];
      }

      return undefined;
    }

    public sample(s: number) {
      this.samples.push(s);

      while (this.samples.length > this.window) {
        this.samples.shift();
      }
    }
  }

  export type BinaryOperator = (a: number, b: number) => number;
  export const Addition: BinaryOperator = (a: number, b: number): number => a + b;
  export const Multiplication: BinaryOperator = (a: number, b: number): number => a * b;

  export interface Series extends Iterable<number>, AsyncIterable<number> {
    readonly neutral?: number;
    readonly start?: number;
    readonly operator: BinaryOperator;

    get approximation(): number;
    get terms(): number;
  }

  export class OpSeries<T extends TermIterable> implements Series {
    *[Symbol.iterator](): Generator<number> {
      for (const term of this.term) {
        yield this.nextTerm(term);
      }
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<number> {
      for await (const term of this.term) {
        yield this.nextTerm(term);
      }
    }

    constructor(
      public readonly term: T,
      public readonly operator: BinaryOperator,
      public readonly neutral: number,
      public readonly start?: number
    ) {}

    protected currentApproximation: number = this.start ?? this.neutral;
    protected currentIndex: number = 0;

    get approximation(): number {
      return this.currentApproximation;
    }

    get terms(): number {
      return this.currentIndex;
    }

    nextTerm(term: number = this.neutral): number {
      this.currentIndex++;
      this.currentApproximation = this.operator(this.currentApproximation, term);

      return this.approximation;
    }
  }

  export class Sum<T extends TermIterable> extends OpSeries<T> {
    constructor(term: T, start?: number) {
      super(term, Addition, 0, start);
    }
  }
  export class Product<T extends TermIterable> extends OpSeries<T> {
    constructor(term: T, start?: number) {
      super(term, Multiplication, 1, start);
    }
  }
}
