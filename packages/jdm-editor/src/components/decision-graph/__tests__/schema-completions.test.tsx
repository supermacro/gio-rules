import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { userEvent as browserUserEvent, page } from 'vitest/browser';

import { ensureWasmLoaded } from '../../../helpers/wasm';
import { JdmConfigProvider } from '../../../theme';
import { DecisionGraph } from '../dg';
import type { DecisionGraphType } from '../dg-types';

describe('schema completions without simulation', () => {
  it.each([
    ['expressionNode', 'single'],
    ['expressionNode', 'loop'],
    ['decisionTableNode', 'single'],
    ['decisionTableNode', 'loop'],
  ] as const)('uses the selected input in %s with %s execution', async (type, executionMode) => {
    await page.viewport(1400, 900);
    await ensureWasmLoaded();
    const user = userEvent.setup();
    const customer = { type: 'object', properties: { age: { type: 'integer' } } };
    const graph: DecisionGraphType = {
      nodes: [
        {
          id: 'input',
          name: 'Request',
          type: 'inputNode',
          position: { x: 0, y: 0 },
          content: {
            schema: JSON.stringify({
              type: 'object',
              properties: { customer, customers: { type: 'array', items: customer } },
            }),
          },
        },
        {
          id: 'node',
          name: 'Node',
          type,
          position: { x: 300, y: 0 },
          content: {
            inputField: executionMode === 'loop' ? 'customers' : 'customer',
            executionMode,
            passThrough: false,
            outputPath: null,
            ...(type === 'expressionNode'
              ? { expressions: [{ id: 'e1', key: 'adult', value: 'age >= 18' }] }
              : {
                  hitPolicy: 'first',
                  inputs: [{ id: 'condition', name: 'Condition', field: '' }],
                  outputs: [{ id: 'result', name: 'Result', field: 'result' }],
                  rules: [{ _id: 'r1', condition: 'age >= 18', result: 'true' }],
                }),
          },
        },
      ],
      edges: [{ id: 'edge', type: 'edge', sourceId: 'input', targetId: 'node' }],
    };
    render(
      <div style={{ height: 800, width: 1400 }}>
        <JdmConfigProvider>
          <DecisionGraph value={graph} />
        </JdmConfigProvider>
      </div>,
    );
    await user.click(
      await screen.findByRole('button', { name: type === 'expressionNode' ? 'Edit Expression' : 'Edit Table' }),
    );
    const cell = await screen.findByText(
      (_, element) =>
        element?.textContent === 'age >= 18' &&
        [...element.children].every((child) => child.textContent !== 'age >= 18'),
    );
    if (type === 'decisionTableNode') {
      act(() => (cell.closest('.grl-dt__cell__input') as HTMLElement).focus());
      await waitFor(() => expect(document.activeElement?.classList.contains('cm-content')).toBe(true));
    } else {
      await user.click(cell);
    }
    await browserUserEvent.keyboard('{End} and ag');
    await waitFor(() =>
      expect([...document.querySelectorAll('.cm-completionLabel')].map((label) => label.textContent)).toContain('age'),
    );
  });
});
