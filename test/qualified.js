import { QValue, sort } from '../src/qualified.js';
class extendedQualified extends QValue {
    constructor(qval, z) {
        super(qval);
        this.isZero = z;
    }
}
;
function testSort(log) {
    const tt = [
        { name: 'no sort needed',
            have: [new extendedQualified(1)],
            expect: [new extendedQualified(1)] },
        { name: 'invert',
            expect: [new extendedQualified(.1), new extendedQualified(.2), new extendedQualified(.3)],
            have: [new extendedQualified(.3), new extendedQualified(.2), new extendedQualified(.1)] },
        { name: 'negative',
            expect: [new extendedQualified(-.1), new extendedQualified(0), new extendedQualified(.3)],
            have: [new extendedQualified(.3), new extendedQualified(0), new extendedQualified(-.1)] },
        { name: 'negative with extra fields',
            expect: [new extendedQualified(-.1), new extendedQualified(0, true), new extendedQualified(.3, false)],
            have: [new extendedQualified(.3, false), new extendedQualified(0, true), new extendedQualified(-.1)] },
    ];
    for (const i in tt) {
        const t = tt[i];
        let have = t.have;
        let r = true;
        sort(have);
        if (have.length != t.expect.length) {
            console.error(have, "!=", t.expect);
            r = false;
        }
        else
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
;
export const name = 'qualified';
export const tests = [
    { name: 'sort', test: testSort },
];
