export type Bitset = Uint32Array;

export function makeBitset(n: number): Bitset {
  return new Uint32Array(Math.ceil(n / 32));
}

export function wordsFor(n: number): number {
  return Math.ceil(n / 32);
}

export function bsFull(n: number): Bitset {
  const w = Math.ceil(n / 32);
  const out = new Uint32Array(w);
  for (let i = 0; i < w - 1; i++) out[i] = 0xffffffff;
  const tail = n - (w - 1) * 32;
  out[w - 1] = tail === 32 ? 0xffffffff : (1 << tail) - 1;
  return out;
}

export function bsClone(a: Bitset): Bitset {
  return new Uint32Array(a);
}

export function bsSet(a: Bitset, i: number, v: boolean): void {
  const w = i >>> 5;
  const b = 1 << (i & 31);
  if (v) a[w] = (a[w]! | b) >>> 0;
  else a[w] = (a[w]! & ~b) >>> 0;
}

export function bsGet(a: Bitset, i: number): boolean {
  return (a[i >>> 5]! & (1 << (i & 31))) !== 0;
}

export function bsPopcount(a: Bitset): number {
  let c = 0;
  for (let i = 0; i < a.length; i++) {
    let x = a[i]! >>> 0;
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    x = (x + (x >>> 4)) & 0x0f0f0f0f;
    c += (Math.imul(x, 0x01010101) >>> 24);
  }
  return c;
}

export function bsAndInto(dst: Bitset, src: Bitset): boolean {
  let changed = false;
  for (let i = 0; i < dst.length; i++) {
    const before = dst[i]! >>> 0;
    const after = (before & src[i]!) >>> 0;
    if (after !== before) {
      dst[i] = after;
      changed = true;
    }
  }
  return changed;
}

export function bsOrInto(dst: Bitset, src: Bitset): void {
  for (let i = 0; i < dst.length; i++) dst[i] = ((dst[i]! | src[i]!) >>> 0);
}

export function bsIter(a: Bitset): number[] {
  const out: number[] = [];
  for (let w = 0; w < a.length; w++) {
    let x = a[w]! >>> 0;
    while (x !== 0) {
      const lowBit = (x & ((~x >>> 0) + 1)) >>> 0;
      const idx = 31 - Math.clz32(lowBit);
      out.push(w * 32 + idx);
      x = (x ^ lowBit) >>> 0;
    }
  }
  return out;
}

export function bsEmpty(a: Bitset): boolean {
  for (let i = 0; i < a.length; i++) if ((a[i]! >>> 0) !== 0) return false;
  return true;
}

export function bsZero(a: Bitset): void {
  a.fill(0);
}

export function bsOnly(n: number, i: number): Bitset {
  const out = makeBitset(n);
  bsSet(out, i, true);
  return out;
}
