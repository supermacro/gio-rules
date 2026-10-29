import type { VariableTypeJson } from '@gorules/zen-engine-wasm';
import { render } from '@testing-library/react';
import React from 'react';

import type { DecisionGraphProps, DecisionGraphType, Simulation } from '../../../../index';
import { DecisionGraph, JdmConfigProvider, useNodeType } from '../../../../index';

function TypeContext({ nodeId }: { nodeId: string }) {
  const type = useNodeType(nodeId, { attachGlobals: false });
  return <output aria-label='Node input type'>{JSON.stringify(type?.toJson() ?? null)}</output>;
}

export function renderTypeContext(value: DecisionGraphType, nodeId: string, simulate?: Simulation) {
  let props: Pick<DecisionGraphProps, 'value' | 'simulate'> = { value, simulate };
  const panels: DecisionGraphProps['panels'] = [
    {
      id: 'types',
      title: 'Types',
      icon: <span>Types</span>,
      renderPanel: () => <TypeContext nodeId={nodeId} />,
    },
  ];
  const editor = () => (
    <div style={{ height: 700, width: 1400 }}>
      <JdmConfigProvider>
        <DecisionGraph {...props} panels={panels} defaultActivePanel='types' />
      </JdmConfigProvider>
    </div>
  );
  const view = render(editor());
  return {
    inputType: (): VariableTypeJson | null => JSON.parse(view.getByLabelText('Node input type').textContent!),
    update(next: Pick<DecisionGraphProps, 'value' | 'simulate'>) {
      props = { ...props, ...next };
      view.rerender(editor());
    },
  };
}
