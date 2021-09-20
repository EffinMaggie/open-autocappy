import { sort } from '../src/qualified.js';
;
function testSort(log) {
    const tt = [
        { name: 'no sort needed',
            have: [{ qvalue: 1 }],
            expect: [{ qvalue: 1 }] },
        { name: 'invert',
            have: [{ qvalue: .1 }, { qvalue: .2 }, { qvalue: .3 }],
            expect: [{ qvalue: .3 }, { qvalue: .2 }, { qvalue: .1 }] },
        { name: 'negative',
            have: [{ qvalue: -.1 }, { qvalue: 0 }, { qvalue: .3 }],
            expect: [{ qvalue: .3 }, { qvalue: 0 }, { qvalue: -.1 }] },
        { name: 'negative with extra fields',
            have: [{ qvalue: -.1 }, { qvalue: 0, isZero: true }, { qvalue: .3, isZero: false }],
            expect: [{ qvalue: .3, isZero: false }, { qvalue: 0, isZero: true }, { qvalue: -.1 }] },
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
                if (have[x].qvalue !== t.expect[x].qvalue) {
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
