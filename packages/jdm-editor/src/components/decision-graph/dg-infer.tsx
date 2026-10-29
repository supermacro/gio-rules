import equal from 'fast-deep-equal/es6/react';
import { useEffect } from 'react';

import { useWasmReady } from '../../helpers/wasm';
import { type DecisionGraphStoreType, NodeTypeKind, useDecisionGraphRaw } from './context/dg-store.context';
import { calculateGraphTypes } from './graph-inference';

export const DecisionGraphInferTypes = () => {
  const { stateStore } = useDecisionGraphRaw();
  const wasmReady = useWasmReady();

  useEffect(() => {
    if (!wasmReady) return;

    const update = (state: DecisionGraphStoreType['state'], prevState?: DecisionGraphStoreType['state']) => {
      try {
        if (prevState && equal(inferenceInputs(state), inferenceInputs(prevState))) return;
        const inputTypes = Object.fromEntries(
          state.decisionGraph.nodes
            .filter((node) => node.type === 'inputNode')
            .map(({ id }) => [id, state.nodeTypes[id]?.[NodeTypeKind.InferredOutput]]),
        );
        stateStore.setState(
          calculateGraphTypes({
            graph: state.decisionGraph,
            simulation: state.simulate,
            customNodes: state.customNodes,
            inputTypes,
          }),
        );
      } catch (err) {
        console.error('error occurred during node type inference', err);
      }
    };
    const unsubscribe = stateStore.subscribe(update);
    update(stateStore.getState());
    return unsubscribe;
  }, [stateStore, wasmReady]);

  return null;
};

const inferenceInputs = ({ decisionGraph, simulate, customNodes, nodeTypes }: DecisionGraphStoreType['state']) => ({
  nodes: decisionGraph.nodes.map(({ id, name, type, content }) => ({ id, name, type, content })),
  edges: decisionGraph.edges,
  simulate,
  customNodes,
  inputTypes: decisionGraph.nodes
    .filter((node) => node.type === 'inputNode')
    .map(({ id }) => nodeTypes[id]?.[NodeTypeKind.InferredOutput]?.toJson()),
});
