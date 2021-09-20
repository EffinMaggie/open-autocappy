function compare(a, b) {
    return b.qvalue - a.qvalue;
}
export function sort(a) {
    return a.sort(compare);
}
export function qualify(value, qvalue) {
    value.qvalue = qvalue;
    return value;
}
