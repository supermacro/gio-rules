import { describe, expect, it } from 'vitest';

import { inferGraphTypes } from '../../../../index';
import { chain, input, table } from './fixtures';

describe('decision table output types', () => {
  it('preserves Null when every row returns null', () => {
    const value = chain(input(), table('T', [{ value: 'null' }, { value: 'null' }]));
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({ Object: { value: 'Null' } });
  });
  it.each([
    ['1', 'true'],
    ['true', '1'],
  ])('combines incompatible row outputs %j and %j conservatively', (first, second) => {
    const value = chain(input(), table('T', [{ value: first }, { value: second }]));
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({ Object: { value: 'Any' } });
  });

  it('preserves a consistent type across different row expressions', () => {
    const value = chain(input(), table('T', [{ value: 'amount + 1' }, { value: 'amount * 2' }]));
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({ Object: { value: 'Number' } });
  });

  it('widens different string literals to String without using the broken Enum checker', () => {
    const value = chain(input(), table('T', [{ value: '"gold"' }, { value: '"silver"' }]));
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({ Object: { value: 'String' } });
  });

  it.each([
    ['null', '1'],
    ['1', 'null'],
    ['unknownField', '1'],
    ['1', 'unknownField'],
  ])('does not discard an unknown or nullable row when combining %j and %j', (first, second) => {
    const value = chain(input(), table('T', [{ value: first }, { value: second }]));
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({ Object: { value: 'Any' } });
  });

  it('reconciles nested object fields independently', () => {
    const value = chain(
      input(),
      table('T', [
        { value: '{ id: amount, details: { flag: true } }' },
        { value: '{ id: amount + 1, details: { flag: amount } }' },
      ]),
    );
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({
      Object: {
        value: { Object: { id: 'Number', details: { Object: { flag: 'Any' } } } },
      },
    });
  });

  it('combines array element types across rows', () => {
    const value = chain(input(), table('T', [{ value: '[amount]' }, { value: '[active]' }]));
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({ Object: { value: { Array: 'Any' } } });
  });

  it('includes the output of an unconditional default row', () => {
    const value = chain(
      input(),
      table('T', [
        { condition: '< 0', value: 'amount' },
        { condition: '', value: 'active' },
      ]),
    );
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({ Object: { value: 'Any' } });
  });

  it('includes materialized column defaults when they become a rule output', () => {
    const value = chain(
      input(),
      table('T', [{ value: 'amount' }, { value: 'true' }], {
        outputs: [{ id: 'value', field: 'value', defaultValue: 'true' }],
      }),
    );
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({ Object: { value: 'Any' } });
  });

  it('does not include unused new-row template defaults in populated outputs', () => {
    const value = chain(
      input(),
      table('T', [{ value: 'amount' }, { value: 'amount + 1' }], {
        outputs: [{ id: 'value', field: 'value', defaultValue: 'false' }],
      }),
    );
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({ Object: { value: 'Number' } });
  });

  it('does not treat a blank output cell as a runtime column default', () => {
    const value = chain(
      input(),
      table('T', [{ value: '' }], {
        outputs: [{ id: 'value', field: 'value', defaultValue: 'amount' }],
      }),
    );
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({ Object: { value: 'Any' } });
  });

  it('does not claim a concrete type for a field missing from a possible row', () => {
    const value = chain(input(), table('T', [{ value: 'amount' }, { value: '' }]));
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({ Object: { value: 'Any' } });
  });

  it('applies collect after reconciling the row output types', () => {
    const value = chain(
      input(),
      table('T', [{ value: 'amount' }, { value: 'active' }], {
        hitPolicy: 'collect',
      }),
    );
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({ Array: { Object: { value: 'Any' } } });
  });

  it('uses the selected input object for table outputs', () => {
    const value = chain(
      input(),
      table('T', [{ value: 'age' }], {
        inputField: 'customer',
        inputFieldName: 'age',
      }),
    );
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({ Object: { value: 'Number' } });
  });

  it('applies loop execution and outputPath to the reconciled item type', () => {
    const value = chain(
      input(),
      table('T', [{ value: 'age' }, { value: 'age > 18' }], {
        inputField: 'customers',
        inputFieldName: 'age',
        executionMode: 'loop',
        outputPath: 'results',
      }),
    );
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({
      Object: { results: { Array: { Object: { value: 'Any' } } } },
    });
  });

  it('retains original fields when a table enables pass-through', () => {
    const value = chain(
      input({ type: 'object', properties: { amount: { type: 'number' } } }),
      table('T', [{ value: 'amount' }], { passThrough: true, outputPath: 'decision' }),
    );
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({
      Object: { amount: 'Number', decision: { Object: { value: 'Number' } } },
    });
  });

  it('retains pass-through fields while making conflicting row outputs conservative', () => {
    const value = chain(
      input({ type: 'object', properties: { amount: { type: 'number' }, active: { type: 'boolean' } } }),
      table('T', [{ value: 'amount' }, { value: 'active' }], {
        passThrough: true,
        outputPath: 'decision',
      }),
    );
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({
      Object: {
        amount: 'Number',
        active: 'Bool',
        decision: { Object: { value: 'Any' } },
      },
    });
  });

  it('keeps an unrelated column precise when another column has conflicting row types', () => {
    const value = chain(
      input(),
      table(
        'T',
        [
          { score: 'amount', approved: 'active' },
          { score: 'active', approved: 'amount > 0' },
        ],
        {
          outputs: [
            { id: 'score', field: 'score' },
            { id: 'approved', field: 'approved' },
          ],
        },
      ),
    );
    expect(inferGraphTypes({ graph: value }).nodes.T.output).toEqual({ Object: { score: 'Any', approved: 'Bool' } });
  });
});
