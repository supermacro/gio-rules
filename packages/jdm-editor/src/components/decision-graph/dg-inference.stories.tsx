import type { Meta, StoryObj } from '@storybook/react';
import { Button, Select, Space, Typography } from 'antd';
import React, { useRef, useState } from 'react';

import { useWasmReady } from '../../helpers/wasm';
import { DecisionGraph, type DecisionGraphRef } from './dg';
import { inferencePipelineGraph, inferencePipelineNotes } from './dg-inference.stories-values';
import type { DecisionGraphType } from './dg-types';
import { inferGraphTypes } from './graph-inference';

const meta: Meta<typeof DecisionGraph> = {
  title: 'Decision Graph/Type Inference',
  component: DecisionGraph,
};

export default meta;

type Story = StoryObj<typeof DecisionGraph>;

export const Pipeline: Story = {
  render: () => <TypeInferencePipeline />,
};

const TypeInferencePipeline = () => {
  const ref = useRef<DecisionGraphRef>(null);
  const [value, setValue] = useState<DecisionGraphType>(() => structuredClone(inferencePipelineGraph));
  const [nodeId, setNodeId] = useState('label-approval');
  const wasmReady = useWasmReady();
  const types = wasmReady ? inferGraphTypes({ graph: value }).nodes[nodeId] : undefined;

  const reset = () => {
    setValue(structuredClone(inferencePipelineGraph));
    setNodeId('label-approval');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 12, borderBottom: '1px solid #8884' }}>
        <Typography.Text strong>Type inference pipeline</Typography.Text>
        <Typography.Paragraph style={{ margin: '4px 0 8px' }}>
          Select a stage to inspect its types, then open it to edit expressions or table cells. Try adding a row,
          deleting an output, or changing an expression to <code>true</code> or <code>&quot;text&quot;</code>.
          Downstream types update without running a simulation. In an expression, type a field prefix or press
          Ctrl+Space to see completions.
        </Typography.Paragraph>
        <Space wrap>
          <Select
            aria-label='Pipeline stage'
            style={{ width: 200 }}
            value={nodeId}
            onChange={setNodeId}
            options={value.nodes.map((node) => ({ label: node.name, value: node.id }))}
          />
          <Button disabled={!types} onClick={() => ref.current?.openTab(nodeId)}>
            Open selected node
          </Button>
          <Button onClick={reset}>Reset graph</Button>
        </Space>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DecisionGraph ref={ref} value={value} onChange={setValue} />
        </div>
        <aside style={{ width: 360, padding: 16, borderLeft: '1px solid #8884', overflow: 'auto' }}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            {value.nodes.find((node) => node.id === nodeId)?.name ?? 'Select a stage'}
          </Typography.Title>
          <Typography.Paragraph>{inferencePipelineNotes[nodeId]}</Typography.Paragraph>
          <Typography.Text strong>Input type</Typography.Text>
          <pre data-testid='pipeline-input-type' style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {wasmReady ? JSON.stringify(types?.input ?? 'Any', null, 2) : 'Loading expression engine…'}
          </pre>
          <Typography.Text strong>Output type</Typography.Text>
          <pre data-testid='pipeline-output-type' style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {wasmReady ? JSON.stringify(types?.output ?? 'Any', null, 2) : 'Loading expression engine…'}
          </pre>
          <Typography.Text type='secondary'>
            Input types are shown before input-field and loop selection.
          </Typography.Text>
        </aside>
      </div>
    </div>
  );
};
