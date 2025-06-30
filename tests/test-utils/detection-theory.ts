import { expect } from 'vitest';
import { parseAsync, type SgRoot } from '@ast-grep/napi';
import type { TypesMap } from '@ast-grep/napi/types/staticTypes';
import type { NapiLang } from '@ast-grep/napi/types/lang';
import type { Modifications } from '@kamaalio/codemod-kit';

export async function invalidRuleSignal(
  source: string,
  lang: NapiLang,
  transform: (ast: SgRoot<TypesMap>) => Promise<Modifications>,
  historyLength?: number,
): Promise<Modifications> {
  const ast = await parseAsync(lang, source);

  const modifications = await transform(ast);
  const updatedSource = modifications.ast.root().text();

  expect(modifications.report.changesApplied, updatedSource).greaterThan(0);
  expect(modifications.history.length, updatedSource).greaterThan(1);
  expect(modifications.history.length, updatedSource).toBe(historyLength ?? modifications.report.changesApplied + 1);
  expect(source).not.toEqual(updatedSource);
  expect(updatedSource).toMatchSnapshot();

  return modifications;
}

export async function validRuleSignal(
  source: string,
  lang: NapiLang,
  transform: (ast: SgRoot<TypesMap>) => Promise<Modifications>,
): Promise<Modifications> {
  const ast = await parseAsync(lang, source);

  const modifications = await transform(ast);
  const updatedSource = modifications.ast.root().text();

  expect(modifications.report.changesApplied, updatedSource).toEqual(0);
  expect(modifications.history.length, updatedSource).toEqual(1);
  expect(source.trim()).toEqual(updatedSource.trim());

  return modifications;
}
