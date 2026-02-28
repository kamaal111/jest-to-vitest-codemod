import { add } from '../src/calculator';

xit('should be skipped via xit', () => {
  expect(add(1, 1)).toBe(99);
});

xtest('should be skipped via xtest', () => {
  expect(add(1, 1)).toBe(99);
});

xdescribe('skipped describe block via xdescribe', () => {
  it('should be skipped', () => {
    expect(add(1, 1)).toBe(99);
  });
});

// eslint-disable-next-line no-constant-condition
if (false) {
  fit('should run as the only test via fit', () => {
    expect(add(1, 1)).toBe(2);
  });

  fdescribe('focused describe block via fdescribe', () => {
    it('focused test passes', () => {
      expect(add(2, 3)).toBe(5);
    });
  });
}
