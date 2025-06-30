import 'vitest';

interface CustomMatchers<R> {
  toStartWith: (expected: string) => R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Matchers<T> extends CustomMatchers<T> {}
}
