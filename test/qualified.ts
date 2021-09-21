import { LogFunction, TestFunction, Testable } from "./run.js";
import { QValue, sort } from "../src/qualified.js";

class extendedQualified extends QValue {
  isZero?: boolean;

  constructor(qval: number, z?: boolean) {
    super(qval);

    this.isZero = z;
  }
}

function testSort(log: LogFunction): boolean {
  const tt: Array<{
    name: string;
    have: Array<extendedQualified>;
    expect: Array<extendedQualified>;
  }> = [
    {
      name: "no sort needed",
      have: [new extendedQualified(1)],
      expect: [new extendedQualified(1)],
    },
    {
      name: "invert",
      expect: [
        new extendedQualified(0.1),
        new extendedQualified(0.2),
        new extendedQualified(0.3),
      ],
      have: [
        new extendedQualified(0.3),
        new extendedQualified(0.2),
        new extendedQualified(0.1),
      ],
    },
    {
      name: "negative",
      expect: [
        new extendedQualified(-0.1),
        new extendedQualified(0),
        new extendedQualified(0.3),
      ],
      have: [
        new extendedQualified(0.3),
        new extendedQualified(0),
        new extendedQualified(-0.1),
      ],
    },
    {
      name: "negative with extra fields",
      expect: [
        new extendedQualified(-0.1),
        new extendedQualified(0, true),
        new extendedQualified(0.3, false),
      ],
      have: [
        new extendedQualified(0.3, false),
        new extendedQualified(0, true),
        new extendedQualified(-0.1),
      ],
    },
  ];

  for (const i in tt) {
    const t = tt[i];
    let have = t.have;
    let r = true;

    sort(have);

    if (have.length != t.expect.length) {
      console.error(have, "!=", t.expect);
      r = false;
    } else
      for (const x in have) {
        if (have[x].q !== t.expect[x].q) {
          console.error(have, "!=", t.expect);
          r = false;
        }
        if (have[x].isZero !== t.expect[x].isZero) {
          console.error(have, "!=", t.expect);
          r = false;
        }
      }

    if (!log(t.name, r)) {
      return false;
    }
  }

  return true;
}

export const name = "qualified";

export const tests = [{ name: "sort", test: testSort }];
