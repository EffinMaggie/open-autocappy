import { LogFunction, TestFunction, Testable } from "./run.js";
import { QDate, DateBetween } from "../src/dated.js";
import { sort } from "../src/qualified.js";

class carrier extends DateBetween {
  message: string;

  constructor(when: Array<Date>, msg: string) {
    let a = Array<QDate>(when.length);

    for (const i in when) {
      a[i] = new QDate(when[i]);
    }
    super(a);

    this.message = msg;
  }
}

function testSort(log: LogFunction): boolean {
  const tt: Array<{
    name: string;
    have: Array<carrier>;
    expect: Array<string>;
  }> = [
    {
      name: "ensure correct sorting by date",
      have: [
        new carrier([new Date("2020-01-01")], "Y2k"),
        new carrier([new Date("1986-06-06")], "sunglasses at night"),
        new carrier([new Date("1995-12-01")], "pokemon?"),
      ],
      expect: ["sunglasses at night", "pokemon?", "Y2k"],
    },
    {
      name: "validate expected overlap behavior",
      have: [
        new carrier([new Date("2020-01-01"), new Date("2021-01-01")], "last"),
        new carrier(
          [new Date("2020-01-01"), new Date("2020-02-01")],
          "shorter"
        ),
        new carrier([new Date("1995-12-01")], "first"),
        new carrier([new Date("2020-05-01"), new Date("2024-05-01")], "tail"),
        new carrier(
          [new Date("2021-06-01"), new Date("2020-05-01")],
          "strange"
        ),
        new carrier([new Date("2020-05-01"), new Date("2021-05-01")], "charm"),
      ],
      expect: ["first", "shorter", "last", "charm", "strange", "tail"],
    },
    { name: "ensure empty-safe", have: [], expect: [] },
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
        if (have[x].message != t.expect[x]) {
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

export const name = "dated";

export const tests = [{ name: "sort", test: testSort }];
