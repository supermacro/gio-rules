import type { DecisionGraphType, DecisionNode, Simulation, SimulationTrace } from '../../../../index';

export const inputSchema = {
  type: 'object',
  properties: {
    amount: { type: 'number' },
    active: { type: 'boolean' },
    customer: { type: 'object', properties: { age: { type: 'integer' } } },
    customers: { type: 'array', items: { type: 'object', properties: { age: { type: 'integer' } } } },
  },
};

type Transform = {
  inputField?: string | null;
  outputPath?: string | null;
  executionMode?: 'single' | 'loop';
  passThrough?: boolean;
};

export const input = (schema: unknown = inputSchema): DecisionNode => ({
  id: 'input',
  name: 'Request',
  type: 'inputNode',
  position: { x: 0, y: 0 },
  content: { schema: typeof schema === 'string' ? schema : JSON.stringify(schema) },
});

export const expression = (id: string, values: Record<string, string>, transform: Transform = {}): DecisionNode => ({
  id,
  name: id,
  type: 'expressionNode',
  position: { x: 300, y: 0 },
  content: {
    inputField: null,
    outputPath: null,
    executionMode: 'single',
    passThrough: false,
    ...transform,
    expressions: Object.entries(values).map(([key, value]) => ({ id: `${id}-${key}`, key, value })),
  },
});

type Column = { id: string; field: string; defaultValue?: string };
export const table = (
  id: string,
  rows: Record<string, string>[],
  {
    inputFieldName = 'amount',
    ...options
  }: Transform & { outputs?: Column[]; hitPolicy?: 'first' | 'collect'; inputFieldName?: string } = {},
): DecisionNode => ({
  id,
  name: id,
  type: 'decisionTableNode',
  position: { x: 300, y: 200 },
  content: {
    inputField: null,
    outputPath: null,
    executionMode: 'single',
    passThrough: false,
    hitPolicy: 'first',
    outputs: [{ id: 'value', name: 'Value', field: 'value' }],
    ...options,
    inputs: [{ id: 'condition', name: 'Condition', field: inputFieldName }],
    rules: rows.map((row, index) => ({ _id: `${id}-row-${index}`, condition: String(index), ...row })),
  },
});

export const switchNode = (id: string, condition: string, hitPolicy: 'first' | 'collect' = 'first'): DecisionNode => ({
  id,
  name: id,
  type: 'switchNode',
  position: { x: 600, y: 0 },
  content: {
    hitPolicy,
    statements: [
      { id: `${id}-yes`, condition, isDefault: false },
      { id: `${id}-else`, condition: '', isDefault: true },
    ],
  },
});

export const graph = (nodes: DecisionNode[], connections: [string, string, string?][]): DecisionGraphType => ({
  nodes,
  edges: connections.map(([sourceId, targetId, sourceHandle], index) => ({
    id: `edge-${index}`,
    sourceId,
    targetId,
    sourceHandle,
    type: 'edge',
  })),
});

export const chain = (...nodes: DecisionNode[]): DecisionGraphType =>
  graph(
    nodes,
    nodes
      .slice(1)
      .map((node, index) => [
        nodes[index].id,
        node.id,
        nodes[index].type === 'switchNode' ? `${nodes[index].id}-yes` : undefined,
      ]),
  );

export const simulation = (
  snapshot: DecisionGraphType,
  entries: { id: string; input: unknown; output: unknown; traceData?: SimulationTrace['traceData'] }[],
): Simulation => ({
  result: {
    performance: '1ms',
    result: {},
    snapshot,
    trace: Object.fromEntries(
      entries.map(({ id, traceData = null, ...entry }) => [
        id,
        {
          id,
          name: snapshot.nodes.find((node) => node.id === id)?.name ?? id,
          performance: '1ms',
          traceData,
          ...entry,
        },
      ]),
    ),
  },
});

export const replaceNode = (value: DecisionGraphType, node: DecisionNode): DecisionGraphType => ({
  ...value,
  nodes: value.nodes.map((current) => (current.id === node.id ? node : current)),
});
