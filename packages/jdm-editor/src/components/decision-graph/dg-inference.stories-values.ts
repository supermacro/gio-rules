import type { DecisionGraphType } from './dg-types';

export const inferencePipelineGraph: DecisionGraphType = {
  nodes: [
    {
      id: 'request',
      name: 'Request',
      type: 'inputNode',
      position: { x: 0, y: 160 },
      content: {
        schema: JSON.stringify(
          {
            type: 'object',
            properties: {
              customer: { type: 'object', properties: { name: { type: 'string' } } },
              amount: { type: 'number' },
              approved: { type: 'boolean' },
              temporaryNote: { type: 'string' },
            },
          },
          null,
          2,
        ),
      },
    },
    {
      id: 'add-fields',
      name: 'AddFields',
      type: 'expressionNode',
      position: { x: 280, y: 160 },
      content: {
        passThrough: true,
        executionMode: 'single',
        expressions: [
          { id: 'subtotal', key: 'subtotal', value: 'amount + 10' },
          { id: 'eligible', key: 'eligible', value: 'approved' },
        ],
      },
    },
    {
      id: 'shipping',
      name: 'Shipping',
      type: 'decisionTableNode',
      position: { x: 560, y: 160 },
      content: {
        passThrough: true,
        executionMode: 'single',
        outputPath: 'pricing',
        hitPolicy: 'first',
        inputs: [{ id: 'subtotal', name: 'Subtotal', field: 'subtotal' }],
        outputs: [{ id: 'fee', name: 'Shipping fee', field: 'shippingFee' }],
        rules: [
          { _id: 'large-order', subtotal: '> 100', fee: '40' },
          { _id: 'default-shipping', subtotal: '', fee: '25' },
        ],
      },
    },
    {
      id: 'drop-fields',
      name: 'DropFields',
      type: 'expressionNode',
      position: { x: 840, y: 160 },
      content: {
        passThrough: false,
        executionMode: 'single',
        expressions: [
          { id: 'customer', key: 'customer', value: 'customer' },
          { id: 'subtotal', key: 'subtotal', value: 'subtotal' },
          { id: 'approved', key: 'approved', value: 'approved' },
          { id: 'pricing', key: 'pricing', value: 'pricing' },
        ],
      },
    },
    {
      id: 'label-approval',
      name: 'LabelApproval',
      type: 'expressionNode',
      position: { x: 1120, y: 160 },
      content: {
        passThrough: false,
        executionMode: 'single',
        expressions: [
          { id: 'customer', key: 'customer', value: 'customer' },
          { id: 'subtotal', key: 'subtotal', value: 'subtotal' },
          { id: 'pricing', key: 'pricing', value: 'pricing' },
          { id: 'approved', key: 'approved', value: 'string(approved)' },
        ],
      },
    },
    {
      id: 'route',
      name: 'Route',
      type: 'switchNode',
      position: { x: 1400, y: 160 },
      content: {
        hitPolicy: 'first',
        statements: [
          { id: 'approved-route', condition: 'approved == "true"', isDefault: false },
          { id: 'default-route', condition: '', isDefault: true },
        ],
      },
    },
    {
      id: 'summary',
      name: 'Summary',
      type: 'expressionNode',
      position: { x: 1680, y: 160 },
      content: {
        passThrough: false,
        executionMode: 'single',
        expressions: [
          { id: 'customer-name', key: 'customerName', value: 'customer.name' },
          { id: 'total', key: 'total', value: 'subtotal + pricing.shippingFee' },
          { id: 'status', key: 'status', value: 'approved' },
          { id: 'original-approved', key: 'originalApproved', value: '$nodes.Request.approved' },
        ],
      },
    },
    {
      id: 'response',
      name: 'Response',
      type: 'outputNode',
      position: { x: 1960, y: 160 },
    },
  ],
  edges: [
    { id: 'e1', type: 'edge', sourceId: 'request', targetId: 'add-fields' },
    { id: 'e2', type: 'edge', sourceId: 'add-fields', targetId: 'shipping' },
    { id: 'e3', type: 'edge', sourceId: 'shipping', targetId: 'drop-fields' },
    { id: 'e4', type: 'edge', sourceId: 'drop-fields', targetId: 'label-approval' },
    { id: 'e5', type: 'edge', sourceId: 'label-approval', targetId: 'route' },
    { id: 'e6', type: 'edge', sourceId: 'route', sourceHandle: 'approved-route', targetId: 'summary' },
    { id: 'e7', type: 'edge', sourceId: 'route', sourceHandle: 'default-route', targetId: 'summary' },
    { id: 'e8', type: 'edge', sourceId: 'summary', targetId: 'response' },
  ],
};

export const inferencePipelineNotes: Record<string, string> = {
  'request': 'Schema: customer.name is String, amount is Number, approved is Bool, and temporaryNote is String.',
  'add-fields': 'Adds subtotal (Number) and eligible (Bool). Pass-through retains the original fields.',
  'shipping':
    'Adds pricing.shippingFee (Number). Change one fee cell to true to see the possible row types become Any.',
  'drop-fields':
    'Pass-through is off. Only the four listed outputs survive; amount, eligible, and temporaryNote are removed.',
  'label-approval': 'Replaces approved: Bool with approved: String while copying the other fields.',
  'route': 'Both switch branches preserve the input types. Conditions do not narrow them.',
  'summary': 'Builds a new output object. status is String; $nodes.Request.approved still supplies the original Bool.',
  'response': 'The input type is the final Summary output. No simulation is needed.',
};
