import { act, render, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DecisionGraphProvider, NodeTypeKind, useDecisionGraphRaw } from '../context/dg-store.context';
import { DecisionGraphInferTypes } from '../dg-infer';
import { chain, expression, input, simulation } from './inference-contract/fixtures';

const StoreProbe = ({
  onStore,
}: {
  onStore: ReturnType<typeof vi.fn<(store: ReturnType<typeof useDecisionGraphRaw>) => void>>;
}) => {
  const store = useDecisionGraphRaw();
  useEffect(() => {
    onStore(store);
  }, [onStore, store]);
  return null;
};

describe('DecisionGraphInferTypes', () => {
  it('derives global $nodes type from node names and output types', async () => {
    const onStore = vi.fn<(store: ReturnType<typeof useDecisionGraphRaw>) => void>();
    render(
      <DecisionGraphProvider>
        <DecisionGraphInferTypes />
        <StoreProbe onStore={onStore} />
      </DecisionGraphProvider>,
    );

    const store = onStore.mock.calls.at(-1)?.[0];
    expect(store).toBeDefined();

    act(() => {
      store?.stateStore.setState({
        decisionGraph: chain(input(), expression('n1', { approved: 'true' })),
      });
    });

    await waitFor(() => {
      const globalType = store?.stateStore.getState().globalType.$nodes;
      expect(globalType?.get('n1.approved').toJson()).toBe('Bool');
    });

    const firstNodesType = store?.stateStore.getState().globalType.$nodes;
    act(() => {
      store?.stateStore.setState({ hoveredEdgeId: 'edge-1' });
    });

    await waitFor(() => {
      expect(store?.stateStore.getState().globalType.$nodes).toBe(firstNodesType);
    });
  });

  it('clears sample-derived types when the simulation is removed', async () => {
    const onStore = vi.fn<(store: ReturnType<typeof useDecisionGraphRaw>) => void>();
    render(
      <DecisionGraphProvider>
        <DecisionGraphInferTypes />
        <StoreProbe onStore={onStore} />
      </DecisionGraphProvider>,
    );

    const store = onStore.mock.calls.at(-1)?.[0];
    expect(store).toBeDefined();

    const graph = chain(input(''), expression('n1', { copied: 'amount' }));
    const simulateWithTrace = simulation(graph, [{ id: 'input', input: null, output: { amount: 2 } }]);
    act(() => {
      store?.stateStore.setState({ decisionGraph: graph, simulate: simulateWithTrace });
    });

    await waitFor(() => {
      const nodeType = store?.stateStore.getState().nodeTypes.n1;
      expect(nodeType?.[NodeTypeKind.InferredInput]?.toJson()).toEqual({ Object: { amount: 'Number' } });
      expect(nodeType?.[NodeTypeKind.InferredOutput]?.toJson()).toEqual({ Object: { copied: 'Number' } });
    });

    act(() => {
      store?.stateStore.setState({ simulate: {} });
    });

    await waitFor(() => {
      const nodeType = store?.stateStore.getState().nodeTypes.n1;
      expect(nodeType?.[NodeTypeKind.Input]).toBeUndefined();
      expect(nodeType?.[NodeTypeKind.Output]).toBeUndefined();
      expect(nodeType?.[NodeTypeKind.InferredInput]?.toJson()).toBe('Any');
      expect(nodeType?.[NodeTypeKind.InferredOutput]?.toJson()).toEqual({ Object: { copied: 'Any' } });
    });
  });
});
