import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import type { DecisionGraphType, Simulation } from '../../../../index';
import { DecisionGraph, JdmConfigProvider } from '../../../../index';
import { chain, expression, input, simulation, switchNode, table } from './fixtures';

const schema = { type: 'object', properties: { schemaField: { type: 'number' } } };
const condition = 'schemaField > 0';

async function renderEditor(value: DecisionGraphType, simulate: Simulation) {
  await page.viewport(1400, 900);
  render(
    <div style={{ height: 800, width: 1400 }}>
      <JdmConfigProvider>
        <DecisionGraph value={value} simulate={simulate} />
      </JdmConfigProvider>
    </div>,
  );
}

async function expectSchemaCompletion() {
  await act(async () => {
    await userEvent.keyboard('{End} and sch');
  });
  await waitFor(
    () =>
      expect([...document.querySelectorAll('.cm-completionLabel')].map((label) => label.textContent)).toContain(
        'schemaField',
      ),
    { timeout: 3000 },
  );
}

describe('schema completions while inspecting a simulation', () => {
  it('uses schema fields in the expression editor', async () => {
    const value = chain(input(schema), expression('N', { approved: condition }));
    const trace = simulation(value, [
      {
        id: 'N',
        input: { sampleOnly: 1 },
        output: { approved: true },
        traceData: { approved: { result: true } },
      },
    ]);
    await renderEditor(value, trace);

    await act(async () => {
      await page.getByRole('button', { name: 'Edit Expression', exact: true }).click();
    });
    await act(async () => {
      await page.getByText(condition, { exact: true }).click();
    });

    await expectSchemaCompletion();
  });

  it('uses schema fields in the table editor', async () => {
    const node = table('N', [{ condition, value: 'true' }], { inputFieldName: '' });
    const value = chain(input(schema), node);
    const trace = simulation(value, [
      {
        id: 'N',
        input: { sampleOnly: 1 },
        output: { value: true },
        traceData: { index: 0, reference_map: {}, rule: { _id: 'N-row-0', condition, value: 'true' } },
      },
    ]);
    await renderEditor(value, trace);

    await act(async () => {
      await page.getByRole('button', { name: 'Edit Table', exact: true }).click();
    });
    const cell = page.getByText(condition, { exact: true });
    act(() => cell.element().closest<HTMLElement>('.grl-dt__cell__input')!.focus());
    await waitFor(() => expect(document.activeElement?.classList.contains('cm-content')).toBe(true));

    await expectSchemaCompletion();
  });

  it('uses schema fields in switch conditions', async () => {
    const value = chain(input(schema), switchNode('N', condition));
    const trace = simulation(value, [
      {
        id: 'N',
        input: { sampleOnly: 1 },
        output: { sampleOnly: 1 },
        traceData: { statements: [{ id: 'N-yes' }] },
      },
    ]);
    await renderEditor(value, trace);

    await act(async () => {
      await page.getByText(condition, { exact: true }).click();
    });

    await expectSchemaCompletion();
  });
});
