import { VariableType } from '@gorules/zen-engine-wasm';
import { act, render, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useNodeType } from '../../../helpers/node-type';
import type * as Wasm from '../../../helpers/wasm';
import { useWasmReady } from '../../../helpers/wasm';
import { DecisionGraphProvider, NodeTypeKind, useDecisionGraphRaw } from '../context/dg-store.context';
import { DecisionGraphInferTypes } from '../dg-infer';
import type { DecisionGraphType } from '../dg-types';

vi.mock('../../../helpers/wasm', async (importOriginal) => {
  const original = await importOriginal<typeof Wasm>();
  return { ...original, useWasmReady: vi.fn(original.useWasmReady) };
});

const schema = JSON.stringify({
  type: 'object',
  properties: {
    customer: { type: 'object', properties: { age: { type: 'integer' } } },
    customers: { type: 'array', items: { type: 'object', properties: { age: { type: 'integer' } } } },
  },
});
const graph: DecisionGraphType = {
  nodes: [
    { id: 'input', name: 'Request', type: 'inputNode', position: { x: 0, y: 0 }, content: { schema } },
    {
      id: 'expr',
      name: 'Expression',
      type: 'expressionNode',
      position: { x: 300, y: 0 },
      content: {
        inputField: 'customer',
        executionMode: 'single',
        passThrough: false,
        outputPath: null,
        expressions: [{ id: 'e1', key: 'adult', value: 'age >= 18' }],
      },
    },
    {
      id: 'next',
      name: 'Next',
      type: 'expressionNode',
      position: { x: 600, y: 0 },
      content: {
        expressions: [{ id: 'e2', key: 'approved', value: 'adult' }],
        passThrough: false,
      },
    },
  ],
  edges: [
    { id: 'e1', type: 'edge', sourceId: 'input', targetId: 'expr' },
    { id: 'e2', type: 'edge', sourceId: 'expr', targetId: 'next' },
  ],
};

type Store = ReturnType<typeof useDecisionGraphRaw>;
const Probe = ({ onStore }: { onStore: (store: Store) => void }) => {
  const store = useDecisionGraphRaw();
  const scoped = useNodeType('expr', { inputField: 'customer' });
  const looped = useNodeType('expr', { inputField: 'customers', executionMode: 'loop' });
  useEffect(() => onStore(store), [store, onStore]);
  return (
    <>
      <output data-testid='scoped'>{JSON.stringify(scoped?.toJson())}</output>
      <output data-testid='looped'>{JSON.stringify(looped?.toJson())}</output>
    </>
  );
};

describe('schema inference', () => {
  it('starts after WASM becomes ready and follows schema edits without a simulation', async () => {
    vi.mocked(useWasmReady).mockReturnValue(false);
    let store: Store | undefined;
    const onStore = (value: Store) => {
      store = value;
    };
    const content = (
      <DecisionGraphProvider>
        <DecisionGraphInferTypes />
        <Probe onStore={onStore} />
      </DecisionGraphProvider>
    );
    const view = render(content);
    act(() => store!.stateStore.setState({ decisionGraph: graph }));
    expect(store!.stateStore.getState().nodeTypes.expr).toBeUndefined();

    vi.mocked(useWasmReady).mockReturnValue(true);
    view.rerender(
      <DecisionGraphProvider>
        <DecisionGraphInferTypes />
        <Probe onStore={onStore} />
      </DecisionGraphProvider>,
    );
    await waitFor(() =>
      expect(store!.stateStore.getState().nodeTypes.next?.[NodeTypeKind.InferredOutput]?.toJson()).toEqual({
        Object: { approved: 'Bool' },
      }),
    );
    expect(JSON.parse(view.getByTestId('scoped').textContent!)).toMatchObject({
      Object: { age: 'Number', $nodes: expect.anything() },
    });
    expect(JSON.parse(view.getByTestId('looped').textContent!)).toMatchObject({
      Object: { age: 'Number', $nodes: expect.anything() },
    });
    expect(store!.stateStore.getState().nodeTypes.expr?.[NodeTypeKind.InferredInput]?.toJson()).toEqual({
      Object: { customer: { Object: { age: 'Number' } }, customers: { Array: { Object: { age: 'Number' } } } },
    });

    act(() =>
      store!.stateStore.setState({
        simulate: { result: { result: {}, performance: '1ms', trace: {}, snapshot: graph } },
      }),
    );
    act(() => store!.stateStore.setState({ simulate: undefined }));
    expect(store!.stateStore.getState().nodeTypes.input?.[NodeTypeKind.Output]?.toJson()).toHaveProperty(
      'Object.customer',
    );

    for (const inputSchema of ['', '{']) {
      act(() => {
        store!.actions.setNodeType(
          'input',
          NodeTypeKind.InferredOutput,
          VariableType.fromJson({ Object: { sample: 'Bool' } }),
        );
        store!.actions.setDecisionGraph({
          ...graph,
          nodes: graph.nodes.map((node) =>
            node.id === 'input' ? { ...node, content: { schema: inputSchema } } : node,
          ),
        });
      });
      await waitFor(() =>
        expect(store!.stateStore.getState().nodeTypes.expr?.[NodeTypeKind.InferredInput]?.toJson()).toEqual({
          Object: { sample: 'Bool' },
        }),
      );
    }
    act(() => store!.actions.setDecisionGraph(graph));
    await waitFor(() =>
      expect(store!.stateStore.getState().nodeTypes.expr?.[NodeTypeKind.InferredInput]?.toJson()).toHaveProperty(
        'Object.customer',
      ),
    );
    vi.mocked(useWasmReady).mockReset();
  });
});
