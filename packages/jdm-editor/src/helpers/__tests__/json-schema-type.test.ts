import { describe, expect, it } from 'vitest';

import { jsonSchemaToVariableType } from '../json-schema-type';

describe('jsonSchemaToVariableType', () => {
  it('maps primitives, arrays and nested objects', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
        score: { type: 'number' },
        active: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
        address: {
          type: 'object',
          properties: { city: { type: 'string' } },
        },
      },
    };

    expect(jsonSchemaToVariableType(schema)).toEqual({
      Object: {
        name: 'String',
        age: 'Number',
        score: 'Number',
        active: 'Bool',
        tags: { Array: 'String' },
        address: { Object: { city: 'String' } },
      },
    });
  });

  it('resolves $defs refs, string enums and optional fields', () => {
    const schema = {
      $defs: {
        Tier: { title: 'Tier', type: 'string', enum: ['gold', 'silver'] },
        Customer: {
          type: 'object',
          properties: {
            tier: { $ref: '#/$defs/Tier' },
            email: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            nickname: { type: ['string', 'null'] },
          },
        },
      },
      type: 'object',
      properties: {
        customer: { $ref: '#/$defs/Customer' },
        kind: { const: 'order' },
      },
    };

    expect(jsonSchemaToVariableType(schema)).toEqual({
      Object: {
        customer: {
          Object: {
            tier: 'String',
            email: 'String',
            nickname: 'String',
          },
        },
        kind: { Const: 'order' },
      },
    });
  });

  it('stops at recursive refs', () => {
    const schema = {
      $defs: {
        Step: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            next: { anyOf: [{ $ref: '#/$defs/Step' }, { type: 'null' }] },
          },
        },
      },
      $ref: '#/$defs/Step',
    };

    expect(jsonSchemaToVariableType(schema)).toEqual({
      Object: { id: 'String', next: 'Any' },
    });
  });

  it('merges allOf and leaves alternatives open', () => {
    const schema = {
      type: 'object',
      properties: {
        merged: {
          allOf: [
            { type: 'object', properties: { a: { type: 'string' } } },
            { type: 'object', properties: { b: { type: 'number' } } },
          ],
        },
        amount: { anyOf: [{ type: 'number' }, { type: 'string' }] },
        contact: {
          oneOf: [
            { type: 'object', properties: { email: { type: 'string' } } },
            { type: 'object', properties: { phone: { type: 'string' } } },
          ],
        },
        metadata: { type: 'object', additionalProperties: true },
      },
    };

    expect(jsonSchemaToVariableType(schema)).toEqual({
      Object: {
        merged: { Object: { a: 'String', b: 'Number' } },
        amount: 'Any',
        contact: 'Any',
        metadata: 'Any',
      },
    });
  });

  it('falls back to Any without a schema', () => {
    expect(jsonSchemaToVariableType(undefined)).toBe('Any');
    expect(jsonSchemaToVariableType({})).toBe('Any');
  });

  it('includes properties beside allOf', () => {
    expect(
      jsonSchemaToVariableType({
        type: 'object',
        properties: { customer: { type: 'string' } },
        allOf: [{ type: 'object', properties: { age: { type: 'integer' } } }],
      }),
    ).toEqual({ Object: { customer: 'String', age: 'Number' } });
  });

  it('merges nested allOf fields and array items', () => {
    const branch = (properties: Record<string, unknown>) => ({
      type: 'object',
      properties: {
        customer: { type: 'object', properties },
        orders: { type: 'array', items: { type: 'object', properties } },
      },
    });
    expect(
      jsonSchemaToVariableType({ allOf: [branch({ name: { type: 'string' } }), branch({ age: { type: 'integer' } })] }),
    ).toEqual({
      Object: {
        customer: { Object: { name: 'String', age: 'Number' } },
        orders: { Array: { Object: { name: 'String', age: 'Number' } } },
      },
    });
  });

  it('keeps sibling fields beside references and resolves escaped pointers', () => {
    expect(
      jsonSchemaToVariableType({
        $defs: { 'a/b': { type: 'object', properties: { name: { type: 'string' } } } },
        $ref: '#/$defs/a~1b',
        properties: { age: { type: 'integer' } },
      }),
    ).toEqual({ Object: { name: 'String', age: 'Number' } });
  });
});
