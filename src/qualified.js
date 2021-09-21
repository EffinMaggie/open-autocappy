/** @format */

export class Q {
  constructor(qval) {
    this.q = qval;
  }
  compare(b) {
    if (b.q == this.q) {
      return 0;
    }
    if (b.q < this.q) {
      return 1;
    }
    return -1;
  }
}
export class QValue extends Q {}
/**
 * template class for an outer hull for a generic Qualified value.
 *
 * Why? Because the date/time range stuff needs this exact feature, and I don't
 * see any need for it to actually be a special implementation for date ranges
 * when there's not need for that.
 *
 * Note: the outer hull in a 1D context is effectively a range:
 *
 * Let's say A, B and C implement Qualified by being QValue instance, and those
 * qvalues are between -1 and 1.
 * The outer hull in this case is intuitively the range from A to C, because
 * there's only one way to define a consistent "inside" in 1D, assuming we want
 * "inside" to not have "holes" (and a lot of confusion because B is part of the
 * points we want to be "inside"; the problem with anything other than A-C is
 * that it becomes ambiguous which of the hulls we want).
 *
 * Assuming the ASCII art is readable to you, it should clarify what's going on:
 * A, B and C are points we want "inside", point o is "outside" and point i is
 * "inside" as well. A, B and C span an unambiguous outer HULL in the // area.
 *
 *   -1  |      0 |     |  1
 *   ----A--------B-----C---
 *     o |        |  i  |
 *       |///// HULL ///|
 *
 * We only need one thing to construct the comparator: the "compare" function
 * from the Qualified interface; we don't actually need to know or care what
 * kind of "point" we have, so this works just the same with Dates.
 */
export class OuterHull extends Array {
  /**
   * construct with a "plain" array of Type.
   *
   * Note: the array MUST have at least 1 item; it doesn't make sense to find
   * a hull over no items - everything is "outside" by default, in exchange for
   * a lot of the code being more complicated; for example, if begin() can't
   * rely on at least 1 item being in the array, this[0] would be an out of
   * bounds access, throwing an error and making us sad. Conversely, by always
   * requiring at least one point, and sorting out list of points, begin() is
   * simply always the first element (this[0]). Thus: win!
   */
  constructor(a) {
    super(a.length);
    for (const i in a) {
      this[i] = a[i];
    }
    /**
     * this sort() is important: this, here, is the Array base class' sort();
     *
     * We should only ever need to sort upon inserting, and Array.sort() should
     * be a linear scan without changes (i.e.: fast) if it's already sorted, so
     * should be fine in the constructor.
     */
    this.sort(function (a, b) {
      return a.compare(b);
    });
  }
  begin() {
    return this[0];
  }
  end() {
    return this[this.length - 1];
  }
  where() {
    return this;
  }
  /**
   * probably not rhe "best" implementation, but it's a fun one!
   *
   * sort of intuitive, even? ;)
   */
  inside(p) {
    var v = new OuterHull(this.where().concat([p]));
    return this.begin().compare(v.begin()) != 0 || this.end().compare(v.end()) != 0;
    // TODO: I should probably write a proof that this works.
  }
  /**
   * hey, I'm not gonna copy and paste code like that in inside! lol. :)
   */
  outside(p) {
    return !this.inside(p);
  }
  /**
   * More fun with algorithms: our comparison actually becomes quite easy given
   * an inside() function!
   *
   * Visual aid:
   *
   *   -1  |      0 |     |  1
   *   ----A--------B-----C---
   *     o |        |  i  |
   *       |///// HULL ///|
   *
   * The comparison  is expected to be 0 if it evaluates to "same" - but for a
   * range, a point is "the same" sorting-wise as a range if it's *inside* the
   * range, as a point is really just a trivial hull, and, say, if we have two
   * hulls {A, B, C} and {i} and {i} is inside {A, B, C} then for our purposes
   * both sort orders are fine.
   *
   * Neat corrolary: for any point outside of the hull, it doesn't matter which
   * point in the hull we compare it with, they'll all have the same sort result
   * which really means we can just compary begin() to {o} and be happy!
   *
   * So... what if we want to respect ranging and compare two ranges with one
   * another? Well... we just go up one order with an OuterHull over an
   * OuterHull... which currently breaks my noodle trying to visualise it, but
   * it really ought to work the way we want it and place all of the hulls in a
   * sorted order that should be unambiguous and as expected - without the weird
   * noodle bending around what's before and what's after between hulls. Yay!
   *
   * Asterisk: {i} should always sort after {A, B, C} even with this simple
   * implementation, because "inside" only compares equal in one direction:
   * {i} is inside {A, B, C}, but {A, B, C} is obviously not in {i}, and sorting
   * an array would most often end up comparing from both sides.
   */
  compareItem(b) {
    if (this.inside(b)) {
      return 0;
    }
    return this.begin().compare(b);
  }
  /**
   * ... okay, sadly we do actually need to implement something sensible to
   * compare two hulls, otherwise, we don't properly implement the interface.
   *
   * "Sadly" because this means thinking about comparators, lol. We can do a
   * few tricks, though...
   */
  compare(b) {
    /**
     * It would help properly specifying how we want to sort, so:
     * - sort over begin() of the hull
     * - if both begin at the same time, sort the shorter element first
     * - otherwise, we don't really care about length
     */
    let bc = this.begin().compare(b.begin());
    if (bc == 0) {
      // same begin(), just sort by end():
      return this.end().compare(b.end());
    }
    return bc;
  }
}
export function sort(a) {
  return a.sort(function (a, b) {
    return a.compare(b);
  });
}
