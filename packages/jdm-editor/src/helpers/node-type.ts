import { VariableType } from '@gorules/zen-engine-wasm';
import { useMemo } from 'react';

import {
  type DecisionGraphStoreType,
  NodeTypeKind,
  useDecisionGraphState,
} from '../components/decision-graph/context/dg-store.context';
import { useWasmReady } from './wasm';

type NodeTypeParams = {
  attachGlobals?: boolean;
  disabled?: boolean;
  inputField?: string | null;
  executionMode?: 'single' | 'loop';
};

const getNodeType = (nodeTypes: DecisionGraphStoreType['state']['nodeTypes'], id: string) =>
  nodeTypes[id]?.[NodeTypeKind.Input] ??
  nodeTypes[id]?.[NodeTypeKind.InferredInput] ??
  VariableType.fromJson({ Object: {} });

export const useNodeType = (
  id: string,
  { attachGlobals = true, disabled = false, inputField, executionMode }: NodeTypeParams = {},
) => {
  const wasmReady = useWasmReady();
  const typeInfo = useDecisionGraphState(({ nodeTypes, globalType }) => {
    if (!wasmReady || disabled) {
      return undefined;
    }

    return { nodeTypes, globalType };
  });

  return useMemo(() => {
    if (!typeInfo?.nodeTypes) {
      return undefined;
    }

    let nodeType = getNodeType(typeInfo.nodeTypes, id).clone();
    if (inputField) nodeType = nodeType.calculateType(inputField);
    if (executionMode === 'loop') nodeType = nodeType.arrayItem();
    if (!attachGlobals) {
      return nodeType;
    }

    Object.entries(typeInfo?.globalType ?? {}).forEach(([k, v]) => nodeType.set(k, v));
    return nodeType;
  }, [typeInfo?.globalType, typeInfo?.nodeTypes, id, attachGlobals, inputField, executionMode]);
};
