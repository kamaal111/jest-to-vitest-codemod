import type { Modifications } from '@kamaalio/codemod-kit';

// TODO: Implement transformations for Jest's focused and skipped test aliases:
// - fit(name, fn)       -> it.only(name, fn)
// - fdescribe(name, fn) -> describe.only(name, fn)
// - xit(name, fn)       -> it.skip(name, fn)
// - xtest(name, fn)     -> it.skip(name, fn)
// - xdescribe(name, fn) -> describe.skip(name, fn)
async function jestFocusedSkippedToVitest(modifications: Modifications): Promise<Modifications> {
  return modifications;
}

export default jestFocusedSkippedToVitest;
