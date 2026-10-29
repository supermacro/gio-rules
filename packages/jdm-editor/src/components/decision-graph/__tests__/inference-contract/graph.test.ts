import { describe, expect, it } from 'vitest';

import { inferGraphTypes } from '../../../../index';
import { chain, expression, graph, input, replaceNode, switchNode, table } from './fixtures';

describe('graph type snapshots', () => {
  it('keeps earlier result snapshots independent of later calculations', () => {
    const value = chain(input(), expression('A', { copied: 'amount' }));
    const first = inferGraphTypes({ graph: value });
    const expected = structuredClone(first);
    const second = inferGraphTypes({ graph: replaceNode(value, expression('A', { copied: 'active' })) });
    expect(second.nodes.A.output).toEqual({ Object: { copied: 'Bool' } });
    expect(first).toEqual(expected);
    second.nodes.A.output = 'Any';
    expect(first).toEqual(expected);
  });

  it('combines every parent in a wider mixed-node graph', () => {
    const parents = Array.from({ length: 12 }, (_, index) =>
      index % 2 === 0
        ? expression(`P${index}`, { [`field${index}`]: 'amount' })
        : table(`P${index}`, [{ value: 'amount' }], { outputs: [{ id: 'value', field: `field${index}` }] }),
    );
    const value = graph(
      [input(), ...parents, switchNode('Join', 'field0 > 0'), expression('N', {})],
      [
        ...parents.map((parent): [string, string] => ['input', parent.id]),
        ...parents.map((parent): [string, string] => [parent.id, 'Join']),
        ['Join', 'N', 'Join-yes'],
      ],
    );
    expect(inferGraphTypes({ graph: value }).nodes.N.input).toEqual({
      Object: Object.fromEntries(parents.map((_, index) => [`field${index}`, 'Number'])),
    });
  });

  it.each(['disconnect', 'remove parent'] as const)(
    'does not retain stale types after %s makes a node unreachable',
    (operation) => {
      const value = chain(input(), expression('A', { oldField: 'amount' }), expression('N', {}));
      const before = inferGraphTypes({ graph: value });
      expect(before.nodes.N.input).toEqual({ Object: { oldField: 'Number' } });
      const after = inferGraphTypes({
        graph: {
          nodes: operation === 'disconnect' ? value.nodes : value.nodes.filter((node) => node.id !== 'A'),
          edges: operation === 'disconnect' ? value.edges.filter((edge) => edge.targetId !== 'N') : [],
        },
      });
      expect(after.nodes.N.input).toBe('Any');
    },
  );

  it('propagates a loop expression output through its output path', () => {
    const value = chain(
      input(),
      expression(
        'A',
        { copied: 'age' },
        {
          inputField: 'customers',
          executionMode: 'loop',
          outputPath: 'mapped',
        },
      ),
      expression('N', {}),
    );
    expect(inferGraphTypes({ graph: value }).nodes.N.input).toEqual({
      Object: { mapped: { Array: { Object: { copied: 'Number' } } } },
    });
  });

  it('retains original fields when an expression enables pass-through', () => {
    const value = chain(
      input({ type: 'object', properties: { amount: { type: 'number' } } }),
      expression(
        'A',
        { copied: 'amount' },
        {
          passThrough: true,
          outputPath: 'result',
        },
      ),
      expression('N', {}),
    );
    expect(inferGraphTypes({ graph: value }).nodes.N.input).toEqual({
      Object: { amount: 'Number', result: { Object: { copied: 'Number' } } },
    });
  });
  it('combines transformations from multiple parents before inferring downstream outputs', () => {
    const value = graph(
      [
        input(),
        expression('A', { approved: 'active' }),
        table('B', [{ value: 'amount' }]),
        expression('Join', { eligible: 'approved', budget: 'value' }),
        switchNode('S', 'budget > 0'),
        expression('N', {}),
      ],
      [
        ['input', 'A'],
        ['input', 'B'],
        ['A', 'Join'],
        ['B', 'Join'],
        ['Join', 'S'],
        ['S', 'N', 'S-yes'],
      ],
    );
    expect(inferGraphTypes({ graph: value }).nodes.N.input).toEqual({ Object: { eligible: 'Bool', budget: 'Number' } });
  });

  it('infers the same result when the node array is not in dependency order', () => {
    const value = chain(
      input(),
      table('T', [{ value: 'amount' }]),
      expression('A', { copied: 'value' }),
      expression('N', {}),
    );
    value.nodes.reverse();
    expect(inferGraphTypes({ graph: value }).nodes.N.input).toEqual({ Object: { copied: 'Number' } });
  });

  it('propagates expression output changes through more than one downstream node', () => {
    const value = chain(
      input(),
      expression('A', { value: 'amount' }),
      switchNode('S', 'true'),
      expression('B', { copied: 'value' }),
      expression('N', {}),
    );
    const before = inferGraphTypes({ graph: value });
    expect(before.nodes.N.input).toEqual({ Object: { copied: 'Number' } });
    const after = inferGraphTypes({ graph: replaceNode(value, expression('A', { value: 'active' })) });
    expect(after.nodes.N.input).toEqual({ Object: { copied: 'Bool' } });
  });

  it('removes deleted expression fields from downstream completions', () => {
    const value = chain(input(), expression('A', { oldField: 'amount', keep: 'active' }), expression('N', {}));
    const before = inferGraphTypes({ graph: value });
    expect(before.nodes.N.input).toEqual({ Object: { oldField: 'Number', keep: 'Bool' } });
    const after = inferGraphTypes({ graph: replaceNode(value, expression('A', { keep: 'active' })) });
    expect(after.nodes.N.input).toEqual({ Object: { keep: 'Bool' } });
  });

  it('reconciles table types again when a row changes', () => {
    const value = chain(input(), table('T', [{ value: 'amount' }, { value: 'amount + 1' }]), expression('N', {}));
    const before = inferGraphTypes({ graph: value });
    expect(before.nodes.N.input).toEqual({ Object: { value: 'Number' } });
    const after = inferGraphTypes({
      graph: replaceNode(value, table('T', [{ value: 'amount' }, { value: 'active' }])),
    });
    expect(after.nodes.N.input).toEqual({ Object: { value: 'Any' } });
  });

  it('includes edits to a materialized default row', () => {
    const value = chain(
      input(),
      table('T', [
        { condition: '< 0', value: 'amount' },
        { condition: '', value: 'amount + 1' },
      ]),
      expression('N', {}),
    );
    const before = inferGraphTypes({ graph: value });
    expect(before.nodes.N.input).toEqual({ Object: { value: 'Number' } });
    const after = inferGraphTypes({
      graph: replaceNode(
        value,
        table('T', [
          { condition: '< 0', value: 'amount' },
          { condition: '', value: 'active' },
        ]),
      ),
    });
    expect(after.nodes.N.input).toEqual({ Object: { value: 'Any' } });
  });

  it('uses the new parent after an edge is rewired', () => {
    const nodes = [
      input(),
      expression('A', { value: 'amount' }),
      expression('B', { value: 'active' }),
      expression('N', {}),
    ];
    const value = graph(nodes, [
      ['input', 'A'],
      ['input', 'B'],
      ['A', 'N'],
    ]);
    const before = inferGraphTypes({ graph: value });
    expect(before.nodes.N.input).toEqual({ Object: { value: 'Number' } });
    const after = inferGraphTypes({
      graph: graph(nodes, [
        ['input', 'A'],
        ['input', 'B'],
        ['B', 'N'],
      ]),
    });
    expect(after.nodes.N.input).toEqual({ Object: { value: 'Bool' } });
  });

  it('removes fields contributed by an edge that is deleted from a join', () => {
    const nodes = [
      input(),
      expression('A', { left: 'amount' }),
      expression('B', { right: 'active' }),
      expression('N', {}),
    ];
    const value = graph(nodes, [
      ['input', 'A'],
      ['input', 'B'],
      ['A', 'N'],
      ['B', 'N'],
    ]);
    const before = inferGraphTypes({ graph: value });
    expect(before.nodes.N.input).toEqual({ Object: { left: 'Number', right: 'Bool' } });
    const after = inferGraphTypes({
      graph: graph(nodes, [
        ['input', 'A'],
        ['input', 'B'],
        ['A', 'N'],
      ]),
    });
    expect(after.nodes.N.input).toEqual({ Object: { left: 'Number' } });
  });

  it('makes conflicting parent field types conservative at a join', () => {
    const value = graph(
      [input(), expression('A', { value: 'amount' }), expression('B', { value: 'active' }), expression('N', {})],
      [
        ['input', 'A'],
        ['input', 'B'],
        ['A', 'N'],
        ['B', 'N'],
      ],
    );
    expect(inferGraphTypes({ graph: value }).nodes.N.input).toEqual({ Object: { value: 'Any' } });
  });

  it.each([
    ['amount', 'active', 'amount'],
    ['active', 'amount', 'amount'],
    ['amount', 'amount', 'active'],
  ])('retains a conflict when more parents contribute the same field: %j, %j, %j', (...sources) => {
    const parents = sources.map((source, index) => expression(`P${index}`, { value: source }));
    const value = graph(
      [input(), ...parents, expression('N', {})],
      parents.flatMap((parent): [string, string][] => [
        ['input', parent.id],
        [parent.id, 'N'],
      ]),
    );
    expect(inferGraphTypes({ graph: value }).nodes.N.input).toEqual({ Object: { value: 'Any' } });
  });

  it('allows an expression to select its input from an upstream $nodes result', () => {
    const value = chain(
      input(),
      expression('A', { customer: 'customer' }),
      expression('B', { copied: 'age' }, { inputField: '$nodes.A.customer' }),
    );
    expect(inferGraphTypes({ graph: value }).nodes.B.output).toEqual({ Object: { copied: 'Number' } });
  });

  it('allows a looping table to select its input from an upstream $nodes result', () => {
    const value = chain(
      input(),
      expression('A', { customers: 'customers' }),
      table('T', [{ value: 'age' }], {
        inputField: '$nodes.A.customers',
        inputFieldName: 'age',
        executionMode: 'loop',
      }),
    );
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({ Array: { Object: { value: 'Number' } } });
  });

  it.each(['first', 'collect'] as const)('passes transformed types through a switch with %s policy', (policy) => {
    const value = chain(
      input(),
      expression('A', { score: 'amount + 1' }),
      switchNode('S', 'score > 0', policy),
      expression('N', {}),
    );
    expect(inferGraphTypes({ graph: value }).nodes.N.input).toEqual({ Object: { score: 'Number' } });
  });

  it('provides transformed upstream fields in the switch input context', () => {
    const value = chain(input(), expression('A', { score: 'amount + 1' }), switchNode('S', 'score > 0'));
    expect(inferGraphTypes({ graph: value }).nodes.S.input).toEqual({ Object: { score: 'Number' } });
  });

  it('uses upstream $nodes types when inferring an expression output', () => {
    const value = chain(
      input(),
      expression('A', { score: 'amount + 1' }),
      expression('B', { copied: '$nodes.A.score' }),
      expression('N', {}),
    );
    expect(inferGraphTypes({ graph: value }).nodes.N.input).toEqual({ Object: { copied: 'Number' } });
  });

  it('uses upstream $nodes types when inferring a table output', () => {
    const value = chain(
      input(),
      expression('A', { score: 'amount + 1' }),
      table('T', [{ value: '$nodes.A.score' }]),
      expression('N', {}),
    );
    expect(inferGraphTypes({ graph: value }).nodes.N.input).toEqual({ Object: { value: 'Number' } });
  });

  it('preserves upstream $nodes references when an expression selects an input field', () => {
    const value = chain(
      input(),
      expression('A', { score: 'amount', customer: 'customer' }),
      expression('B', { copied: '$nodes.A.score' }, { inputField: 'customer' }),
      expression('N', {}),
    );
    expect(inferGraphTypes({ graph: value }).nodes.N.input).toEqual({ Object: { copied: 'Number' } });
  });

  it('preserves upstream $nodes references during loop execution', () => {
    const value = chain(
      input(),
      expression('A', { score: 'amount', customers: 'customers' }),
      table('T', [{ value: '$nodes.A.score' }], {
        inputField: 'customers',
        inputFieldName: 'age',
        executionMode: 'loop',
      }),
      expression('N', {}),
    );
    expect(inferGraphTypes({ graph: value }).nodes.N.input).toEqual({ Array: { Object: { value: 'Number' } } });
  });

  it('updates dependent output types when an upstream $nodes result changes', () => {
    const value = chain(
      input(),
      expression('A', { score: 'amount' }),
      expression('B', { copied: '$nodes.A.score' }),
      expression('N', {}),
    );
    const before = inferGraphTypes({ graph: value });
    expect(before.nodes.N.input).toEqual({ Object: { copied: 'Number' } });
    const after = inferGraphTypes({ graph: replaceNode(value, expression('A', { score: 'active' })) });
    expect(after.nodes.N.input).toEqual({ Object: { copied: 'Bool' } });
  });

  it('invalidates a $nodes reference when its upstream node is renamed', () => {
    const value = chain(
      input(),
      expression('A', { score: 'amount' }),
      expression('B', { copied: '$nodes.A.score' }),
      expression('N', {}),
    );
    const before = inferGraphTypes({ graph: value });
    expect(before.nodes.N.input).toEqual({ Object: { copied: 'Number' } });
    const after = inferGraphTypes({
      graph: replaceNode(value, { ...expression('A', { score: 'amount' }), name: 'Renamed' }),
    });
    expect(after.nodes.N.input).toEqual({ Object: { copied: 'Any' } });
  });

  it('supports expression references to earlier expressions in the same node', () => {
    const value = chain(input(), expression('A', { first: 'amount', second: '$.first' }), expression('N', {}));
    expect(inferGraphTypes({ graph: value }).nodes.N.input).toEqual({ Object: { first: 'Number', second: 'Number' } });
  });

  it('does not mutate the graph supplied by the consumer', () => {
    const value = chain(input(), table('T', [{ value: 'amount + 1' }]), expression('N', {}));
    const before = structuredClone(value);
    expect(inferGraphTypes({ graph: value }).nodes.N.input).toEqual({ Object: { value: 'Number' } });
    expect(value).toEqual(before);
  });
});
