export interface Qualified {
  qvalue: number;
}

function compare(a: Qualified, b: Qualified): number {
  return b.qvalue - a.qvalue;
}

export function sort<Type extends Qualified>(a: Array<Type>): Array<Type> {
  return a.sort(compare);
}

export function qualify<Type extends Qualified>(value: Type, qvalue: number): Type {
  value.qvalue = qvalue;

  return value;
}
