import type { VariableTypeJson } from '@gorules/zen-engine-wasm';

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isObjectType = (type: VariableTypeJson): type is { Object: Record<string, VariableTypeJson> } =>
  typeof type === 'object' && 'Object' in type;

const mergeTypes = (left: VariableTypeJson, right: VariableTypeJson): VariableTypeJson => {
  if (left === 'Any') return right;
  if (right === 'Any') return left;
  if (isObjectType(left) && isObjectType(right)) {
    const properties = { ...left.Object };
    for (const [key, value] of Object.entries(right.Object)) {
      properties[key] = key in properties ? mergeTypes(properties[key], value) : value;
    }
    return { Object: properties };
  }
  if (typeof left === 'object' && 'Array' in left && typeof right === 'object' && 'Array' in right) {
    return { Array: mergeTypes(left.Array, right.Array) };
  }
  return JSON.stringify(left) === JSON.stringify(right) ? left : 'Any';
};

/** Converts JSON Schema to the expression checker's supported types. */
export const jsonSchemaToVariableType = (schema: unknown): VariableTypeJson => {
  const convert = (node: unknown, seenRefs: Set<string>): VariableTypeJson => {
    if (!isObject(node)) return 'Any';

    let type: VariableTypeJson = 'Any';
    if (typeof node.$ref === 'string' && node.$ref.startsWith('#/') && !seenRefs.has(node.$ref)) {
      const reference = node.$ref
        .slice(2)
        .split('/')
        .reduce<unknown>(
          (value, key) => (isObject(value) ? value[key.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined),
          schema,
        );
      type = convert(reference, new Set(seenRefs).add(node.$ref));
    }

    const declared = Array.isArray(node.type) ? node.type : [node.type];
    const nonNull = declared.filter((value) => value !== undefined && value !== 'null');
    const declaredType =
      nonNull.length === 1 ? nonNull[0] : nonNull.length === 0 && node.properties ? 'object' : undefined;
    let ownType: VariableTypeJson = 'Any';
    switch (declaredType) {
      case 'object':
        if (isObject(node.properties)) {
          ownType = {
            Object: Object.fromEntries(
              Object.entries(node.properties).map(([key, value]) => [key, convert(value, seenRefs)]),
            ),
          };
        }
        break;
      case 'array':
        ownType = { Array: convert(node.items, seenRefs) };
        break;
      case 'string':
        ownType = 'String';
        break;
      case 'number':
      case 'integer':
        ownType = 'Number';
        break;
      case 'boolean':
        ownType = 'Bool';
        break;
      default:
        if (declared.includes('null') && nonNull.length === 0) ownType = 'Null';
    }

    if (typeof node.const === 'string') ownType = { Const: node.const };
    // The 0.23.1 checker reports valid Enum comparisons as always false.
    if (
      Array.isArray(node.enum) &&
      node.enum.some((value) => typeof value === 'string') &&
      node.enum.every((value) => value === null || typeof value === 'string')
    )
      ownType = 'String';
    type = mergeTypes(type, ownType);

    if (Array.isArray(node.allOf)) {
      for (const branch of node.allOf) type = mergeTypes(type, convert(branch, seenRefs));
    }
    const variants = node.anyOf ?? node.oneOf;
    if (Array.isArray(variants)) {
      const alternatives = variants.filter((branch) => !isObject(branch) || branch.type !== 'null');
      // The checker cannot represent a union. Preserve independently declared fields.
      if (alternatives.length === 1) type = mergeTypes(type, convert(alternatives[0], seenRefs));
    }
    return type;
  };
  return convert(schema, new Set());
};
