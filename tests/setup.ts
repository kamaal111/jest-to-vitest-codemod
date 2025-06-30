import { expect } from 'vitest';

expect.extend({
  toStartWith(received: string, expected: string) {
    const { isNot } = this;

    return {
      pass: received.slice(0, expected.length) === expected,
      message: () => `${received} did${isNot ? ' not' : ''} start with ${expected}`,
    };
  },
});
