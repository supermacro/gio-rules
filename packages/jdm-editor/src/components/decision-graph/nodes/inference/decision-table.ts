import { VariableType, type VariableTypeJson } from '@gorules/zen-engine-wasm';

import { createExpressionContext } from '../../../../helpers/expression-context';
import type { NodeDecisionTableData } from '../specifications/decision-table.specification';
import type { InferTypeData } from '../specifications/specification-types';

export const inferDecisionTableOutput = ({ input, content, globals }: InferTypeData<NodeDecisionTableData>) => {
  const nodeInput = createExpressionContext(input, {
    inputField: content.inputField,
    executionMode: content.executionMode,
    globals: globals ?? {},
  });

  let outputType = VariableType.fromJson({ Object: {} });
  for (const output of (content.outputs ?? []).filter((column) => !!column.field)) {
    const alternatives = (content.rules ?? []).map((rule): VariableTypeJson => {
      const expression = rule[output.id];
      // Column defaults are new-row templates. A blank runtime cell has no value.
      return expression?.trim() ? nodeInput.calculateType(expression).toJson() : 'Any';
    });
    const type = alternatives.length > 0 ? alternatives.reduce(combineAlternatives) : 'Any';
    outputType.set(output.field!, VariableType.fromJson(type));
  }

  if (content.hitPolicy === 'collect') outputType = outputType.toArray();
  if (content.executionMode === 'loop') outputType = outputType.toArray();
  if (content.outputPath) {
    const wrapped = VariableType.fromJson({ Object: {} });
    wrapped.set(content.outputPath, outputType);
    outputType = wrapped;
  }
  return content.passThrough ? input.merge(outputType) : outputType;
};

// Alternatives describe possible values, so unknown and missing fields must stay unknown.
const combineAlternatives = (left: VariableTypeJson, right: VariableTypeJson): VariableTypeJson => {
  if (left === 'Any' || right === 'Any') return 'Any';
  if (typeof left === 'object' && 'Object' in left && typeof right === 'object' && 'Object' in right) {
    const keys = new Set([...Object.keys(left.Object), ...Object.keys(right.Object)]);
    return {
      Object: Object.fromEntries(
        [...keys].map((key) => [key, combineAlternatives(left.Object[key] ?? 'Any', right.Object[key] ?? 'Any')]),
      ),
    };
  }
  if (typeof left === 'object' && 'Array' in left && typeof right === 'object' && 'Array' in right) {
    return { Array: combineAlternatives(left.Array, right.Array) };
  }
  const isString = (type: VariableTypeJson) =>
    type === 'String' || (typeof type === 'object' && ('Const' in type || 'Enum' in type));
  if (isString(left) && isString(right)) return 'String';
  return left === right ? left : 'Any';
};
