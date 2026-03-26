import { decisionTableSpecification } from './decision-table.specification';
import { expressionSpecification } from './expression.specification';
import { functionSpecification } from './function.specification';
import { inputSpecification } from './input.specification';
import { outputSpecification } from './output.specification';
import { NodeKind } from './specification-types';
import type { NodeSpecification } from './specification-types';
import { switchSpecification } from './switch.specification';

function makeNodeSpecification<T extends Record<NodeKind, V>, V extends NodeSpecification>(o: T): Readonly<T> {
  return o;
}

export const nodeSpecification = makeNodeSpecification({
  get [NodeKind.Input]() {
    return inputSpecification;
  },
  get [NodeKind.Output]() {
    return outputSpecification;
  },
  get [NodeKind.DecisionTable]() {
    return decisionTableSpecification;
  },
  get [NodeKind.Expression]() {
    return expressionSpecification;
  },
  get [NodeKind.Function]() {
    return functionSpecification;
  },
  get [NodeKind.Switch]() {
    return switchSpecification;
  },
});
