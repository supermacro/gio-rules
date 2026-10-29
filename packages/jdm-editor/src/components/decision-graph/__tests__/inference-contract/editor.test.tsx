import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderTypeContext } from './editor-harness';
import { chain, expression, input, replaceNode, simulation } from './fixtures';

describe('editor integration with graph inference', () => {
  it('keeps schema types when the simulation prop changes', async () => {
    const value = chain(input({ type: 'object', properties: { amount: { type: 'number' } } }), expression('N', {}));
    const editor = renderTypeContext(value, 'N');
    await waitFor(() => expect(editor.inputType()).toEqual({ Object: { amount: 'Number' } }));

    editor.update({ simulate: simulation(value, [{ id: 'N', input: { amount: false, sampleOnly: 1 }, output: {} }]) });

    await waitFor(() => expect(editor.inputType()).toEqual({ Object: { amount: 'Number' } }));
  });

  it('publishes upstream edits while an old simulation remains visible', async () => {
    const value = chain(input(), expression('A', { oldField: 'amount' }), expression('N', {}));
    const trace = simulation(value, [
      { id: 'A', input: { amount: 2 }, output: { oldField: 2 } },
      { id: 'N', input: { oldField: 2 }, output: {} },
    ]);
    const editor = renderTypeContext(value, 'N', trace);
    await waitFor(() => expect(editor.inputType()).toEqual({ Object: { oldField: 'Number' } }));

    editor.update({ value: replaceNode(value, expression('A', { approved: 'active' })) });

    await waitFor(() => expect(editor.inputType()).toEqual({ Object: { approved: 'Bool' } }));
  });

  it('clears the published type when a node becomes unreachable', async () => {
    const value = chain(input(), expression('A', { oldField: 'amount' }), expression('N', {}));
    const editor = renderTypeContext(value, 'N');
    await waitFor(() => expect(editor.inputType()).toEqual({ Object: { oldField: 'Number' } }));

    editor.update({ value: { ...value, edges: value.edges.filter((edge) => edge.targetId !== 'N') } });

    await waitFor(() => expect(editor.inputType()).toBe('Any'));
  });
});
