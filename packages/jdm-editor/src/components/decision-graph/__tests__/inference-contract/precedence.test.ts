import { describe, expect, it } from 'vitest';

import { inferGraphTypes } from '../../../../index';
import { chain, expression, input, inputSchema, replaceNode, simulation } from './fixtures';

const amountSchema = { type: 'object', properties: { amount: { type: 'number' } } };

describe('inference input precedence', () => {
  it('keeps a valid empty schema authoritative over simulation samples', () => {
    const graph = chain(input({}), expression('N', { copied: 'sampleOnly' }));
    const trace = simulation(graph, [
      { id: 'input', input: null, output: { sampleOnly: 1 } },
      { id: 'N', input: { sampleOnly: 1 }, output: { copied: 1 } },
    ]);
    const result = inferGraphTypes({ graph, simulation: trace });
    expect(result.nodes.N.input).toBe('Any');
    expect(result.nodes.N.output).toEqual({ Object: { copied: 'Any' } });
  });

  it('uses the schema instead of a conflicting simulation input', () => {
    const graph = chain(input(amountSchema), expression('N', {}));
    const trace = simulation(graph, [{ id: 'N', input: { amount: 'wrong', sampleOnly: true }, output: {} }]);
    const result = inferGraphTypes({ graph, simulation: trace });
    expect(result.nodes.N.input).toEqual({ Object: { amount: 'Number' } });
  });

  it('does not fill unknown schema fields from a simulation', () => {
    const graph = chain(input({ type: 'object', properties: { payload: {} } }), expression('N', {}));
    const trace = simulation(graph, [{ id: 'N', input: { payload: { guessed: 1 }, extra: 1 }, output: {} }]);
    expect(inferGraphTypes({ graph, simulation: trace }).nodes.N.input).toEqual({ Object: { payload: 'Any' } });
  });

  it('keeps the same schema type across different simulation inputs', () => {
    const graph = chain(input(amountSchema), expression('N', {}));
    const firstTrace = simulation(graph, [{ id: 'N', input: { amount: false }, output: {} }]);
    const secondTrace = simulation(graph, [{ id: 'N', input: { amount: 'wrong' }, output: {} }]);
    expect(inferGraphTypes({ graph, simulation: firstTrace }).nodes.N.input).toEqual({ Object: { amount: 'Number' } });
    expect(inferGraphTypes({ graph, simulation: secondTrace }).nodes.N.input).toEqual({ Object: { amount: 'Number' } });
  });

  it('uses an edited expression instead of its old simulated output', () => {
    const graph = chain(input(), expression('A', { value: 'amount' }), expression('N', {}));
    const trace = simulation(graph, [
      { id: 'A', input: { amount: 2 }, output: { value: 2 } },
      { id: 'N', input: { value: 2 }, output: {} },
    ]);
    const edited = replaceNode(graph, expression('A', { approved: 'active' }));
    expect(inferGraphTypes({ graph: edited, simulation: trace }).nodes.N.input).toEqual({
      Object: { approved: 'Bool' },
    });
  });

  it.each(['', '{', 'null'])('uses an input sample when schema %j provides no types', (schema) => {
    const graph = chain(input(schema), expression('A', { copied: 'amount' }));
    const trace = simulation(graph, [{ id: 'input', input: null, output: { amount: 4 } }]);
    expect(inferGraphTypes({ graph, simulation: trace }).nodes.A.output).toEqual({ Object: { copied: 'Number' } });
  });

  it('uses a newly supplied schema while keeping the old simulation', () => {
    const graph = chain(input(''), expression('N', {}));
    const trace = simulation(graph, [
      { id: 'input', input: null, output: { amount: false } },
      { id: 'N', input: { amount: false }, output: {} },
    ]);
    const withSchema = replaceNode(graph, input(amountSchema));
    expect(inferGraphTypes({ graph: withSchema, simulation: trace }).nodes.N.input).toEqual({
      Object: { amount: 'Number' },
    });
  });

  it('falls back to the input sample after the schema is removed', () => {
    const graph = chain(input(amountSchema), expression('N', {}));
    const trace = simulation(graph, [{ id: 'input', input: null, output: { amount: false } }]);
    const withoutSchema = replaceNode(graph, input(''));
    expect(inferGraphTypes({ graph: withoutSchema, simulation: trace }).nodes.N.input).toEqual({
      Object: { amount: 'Bool' },
    });
  });

  it('uses the latest input sample for fallback inference', () => {
    const graph = chain(input(''), expression('A', { copied: 'amount' }));
    const firstTrace = simulation(graph, [{ id: 'input', input: null, output: { amount: 2 } }]);
    const secondTrace = simulation(graph, [{ id: 'input', input: null, output: { amount: true } }]);
    expect(inferGraphTypes({ graph, simulation: firstTrace }).nodes.A.output).toEqual({ Object: { copied: 'Number' } });
    expect(inferGraphTypes({ graph, simulation: secondTrace }).nodes.A.output).toEqual({ Object: { copied: 'Bool' } });
  });

  it('retains schema types when no simulation is supplied', () => {
    const graph = chain(input(inputSchema), expression('A', { copied: 'active' }));
    expect(inferGraphTypes({ graph }).nodes.A.output).toEqual({ Object: { copied: 'Bool' } });
  });

  it('does not replace an unknown expression with a sampled output when a schema is supplied', () => {
    const graph = chain(input(), expression('A', { value: 'missingField' }));
    const trace = simulation(graph, [{ id: 'A', input: { missingField: 1 }, output: { value: 1 } }]);
    expect(inferGraphTypes({ graph, simulation: trace }).nodes.A.output).toEqual({ Object: { value: 'Any' } });
  });
});
