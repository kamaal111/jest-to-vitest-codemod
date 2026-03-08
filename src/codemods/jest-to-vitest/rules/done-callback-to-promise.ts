import {
  type FindAndReplaceConfig,
  findAndReplaceConfigModifications,
  type Modifications,
} from '@kamaalio/codemod-kit';
import type { SgNode } from '@ast-grep/napi';
import type { TypesMap, Kinds } from '@ast-grep/napi/types/staticTypes.js';

type AstNode = SgNode<TypesMap, Kinds<TypesMap>>;

function getDoneParamName(node: AstNode): string | null {
  const params = node.children().find(c => c.kind() === 'formal_parameters');
  if (params != null) {
    const paramChildren = params.children().filter(c => c.kind() === 'required_parameter' || c.kind() === 'identifier');
    if (paramChildren.length !== 1) return null;
    const param = paramChildren[0];
    if (param.kind() === 'identifier') return param.text();
    const ident = param.children().find((c: AstNode) => c.kind() === 'identifier');
    return ident?.text() ?? null;
  }

  const firstChild = node.children()[0];
  if (firstChild != null && firstChild.kind() === 'identifier') {
    return firstChild.text();
  }

  return null;
}

const DONE_CALLBACK_TO_PROMISE: Array<FindAndReplaceConfig> = [
  {
    rule: {
      any: [
        { pattern: 'test($NAME, $CALLBACK)' },
        { pattern: 'test($NAME, $CALLBACK, $TIMEOUT)' },
        { pattern: 'it($NAME, $CALLBACK)' },
        { pattern: 'it($NAME, $CALLBACK, $TIMEOUT)' },
      ],
    },
    transformer: node => {
      const callback = node.getMatch('CALLBACK');
      if (callback == null) return null;

      const kind = callback.kind();
      if (kind !== 'arrow_function') return null;

      const paramName = getDoneParamName(callback);
      if (paramName == null || paramName !== 'done') return null;

      const callbackText = callback.text();
      const children = callback.children();
      const arrowToken = children.find(c => c.kind() === '=>');
      if (arrowToken == null) return null;

      const arrowOffset = arrowToken.range().start.index - callback.range().start.index;
      const bodyPart = callbackText.substring(arrowOffset + 2).trim();

      if (!bodyPart.startsWith('{')) return null;

      const bodyContent = bodyPart.substring(1, bodyPart.length - 1);
      const newCallback = `() => new Promise<void>((resolve, reject) => { const done = (err?: unknown) => err ? reject(err) : resolve();${bodyContent}})`;

      const fullText = node.text();
      return fullText.replace(callbackText, newCallback);
    },
  },
];

export async function doneCallbackToPromise(modifications: Modifications): Promise<Modifications> {
  return findAndReplaceConfigModifications(modifications, DONE_CALLBACK_TO_PROMISE);
}
