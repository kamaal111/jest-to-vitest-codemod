import { describe, it, expect } from '@jest/globals';

describe('require-patterns', () => {
  it('transforms require inside arrow function to async arrow', async () => {
    const loadCalculator = () => {
      return require('../src/calculator');
    };
    const calc = await loadCalculator();
    expect(calc.add(1, 2)).toBe(3);
  });

  it('transforms require inside already-async arrow function without duplicate async', async () => {
    const loadCalculator = async () => {
      return require('../src/calculator');
    };
    const calc = await loadCalculator();
    expect(calc.subtract(5, 3)).toBe(2);
  });

  it('transforms require inside a function declaration to async function', async () => {
    function loadCalculator() {
      return require('../src/calculator');
    }
    const calc = await loadCalculator();
    expect(calc.multiply(4, 3)).toBe(12);
  });

  it('transforms require inside a function expression to async function', async () => {
    const loadCalculator = function () {
      return require('../src/calculator');
    };
    const calc = await loadCalculator();
    expect(calc.divide(10, 2)).toBe(5);
  });
});
