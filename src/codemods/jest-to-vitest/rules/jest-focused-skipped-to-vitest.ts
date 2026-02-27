import {
  findAndReplaceConfigModifications,
  type FindAndReplaceConfig,
  type Modifications,
} from '@kamaalio/codemod-kit';

const FOCUSED_SKIPPED_MAPPING: Array<{ source: string; target: string }> = [
  { source: 'fit', target: 'it.only' },
  { source: 'fdescribe', target: 'describe.only' },
  { source: 'xit', target: 'it.skip' },
  { source: 'xtest', target: 'it.skip' },
  { source: 'xdescribe', target: 'describe.skip' },
];

const FOCUSED_SKIPPED_CONFIGS: Array<FindAndReplaceConfig> = FOCUSED_SKIPPED_MAPPING.map(({ source, target }) => ({
  rule: { pattern: `${source}($$$ARGS)` },
  transformer: node => {
    const text = node.text();
    return `${target}(${text.slice(source.length + 1, -1)})`;
  },
}));

async function jestFocusedSkippedToVitest(modifications: Modifications): Promise<Modifications> {
  return findAndReplaceConfigModifications(modifications, FOCUSED_SKIPPED_CONFIGS);
}

export default jestFocusedSkippedToVitest;
