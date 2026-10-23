import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DecisionGraphProvider } from '../../context/dg-store.context';
import { DecisionGraphEmpty } from '../../dg-empty';
import { GraphSideToolbar } from '../graph-side-toolbar';

const graph = {
  nodes: [
    {
      id: 'dt-allowed',
      type: 'decisionTableNode',
      name: 'Allowed Table',
      content: { hitPolicy: 'first', inputs: [], outputs: [], rules: [] },
      position: { x: 0, y: 0 },
    },
    {
      id: 'dt-hidden',
      type: 'decisionTableNode',
      name: 'Hidden Table',
      content: { hitPolicy: 'first', inputs: [], outputs: [], rules: [] },
      position: { x: 250, y: 0 },
    },
  ],
  edges: [],
};

describe('GraphSideToolbar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('toggles active panel and emits onPanelsChange callback', async () => {
    const user = userEvent.setup();
    const onPanelsChange = vi.fn<(panel?: string) => void>();

    render(
      <DecisionGraphProvider>
        <DecisionGraphEmpty
          value={graph}
          panels={[
            {
              id: 'inspector',
              title: 'Inspector',
              icon: <span>Inspector</span>,
              renderPanel: () => <div>Panel</div>,
            },
          ]}
          onPanelsChange={onPanelsChange}
        />
        <GraphSideToolbar />
      </DecisionGraphProvider>,
    );

    const panelButton = screen.getByRole('button', { name: 'Inspector' });

    await user.click(panelButton);
    expect(onPanelsChange).toHaveBeenLastCalledWith('inspector');

    await user.click(panelButton);
    expect(onPanelsChange).toHaveBeenLastCalledWith(undefined);
  });

  it('keeps JSON upload available without Excel inputs or menus', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DecisionGraphProvider>
        <DecisionGraphEmpty value={graph} />
        <GraphSideToolbar />
      </DecisionGraphProvider>,
    );

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('accept', 'application/json');
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(1);
    expect(screen.queryByText(/excel/i)).not.toBeInTheDocument();

    const inputClick = vi.spyOn(input!, 'click').mockImplementation(() => undefined);
    await user.click(screen.getByRole('button', { name: 'cloud-upload' }));
    expect(inputClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('imports a JSON decision model', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <DecisionGraphProvider>
        <DecisionGraphEmpty value={{ nodes: [], edges: [] }} onChange={onChange} />
        <GraphSideToolbar />
      </DecisionGraphProvider>,
    );

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File(
      [JSON.stringify({ contentType: 'application/vnd.gorules.decision', ...graph })],
      'decision-model.json',
      { type: 'application/json' },
    );
    await user.upload(input!, file);

    await vi.waitFor(() => {
      expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject(graph);
    });
  });

  it('downloads the graph as JSON', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:decision-model');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let downloadedName: string | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadedName = this.download;
    });

    render(
      <DecisionGraphProvider>
        <DecisionGraphEmpty value={graph} name='decision-model.json' />
        <GraphSideToolbar />
      </DecisionGraphProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'cloud-download' }));

    const blob = createObjectURL.mock.calls[0]?.[0];
    if (!(blob instanceof Blob)) throw new Error('Expected a JSON download blob');
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text())).toEqual({ contentType: 'application/vnd.gorules.decision', ...graph });
    expect(downloadedName).toBe('decision-model.json');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:decision-model');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('hides file controls in view mode', () => {
    render(
      <DecisionGraphProvider>
        <DecisionGraphEmpty
          value={graph}
          viewConfig={{ enabled: true, permissions: { 'dt-allowed': 'edit:full', 'dt-hidden': null } }}
        />
        <GraphSideToolbar />
      </DecisionGraphProvider>,
    );

    expect(screen.queryByRole('button', { name: 'cloud-upload' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'cloud-download' })).not.toBeInTheDocument();
  });

  it('keeps JSON download available when editing is disabled', () => {
    render(
      <DecisionGraphProvider>
        <DecisionGraphEmpty value={graph} disabled />
        <GraphSideToolbar />
      </DecisionGraphProvider>,
    );

    expect(screen.queryByRole('button', { name: 'cloud-upload' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'cloud-download' })).toBeEnabled();
  });
});
