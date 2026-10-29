import { VariableType, type VariableTypeJson } from '@gorules/zen-engine-wasm';

import { jsonSchemaToVariableType } from '../../helpers/json-schema-type';
import { createGraphWalker } from '../../helpers/traversal';
import { type DecisionGraphStoreType, NodeTypeKind } from './context/dg-store.context';
import type { DecisionGraphType } from './dg-types';
import type { NodeKind } from './nodes/specifications/specification-types';
import { nodeSpecification } from './nodes/specifications/specifications';
import type { Simulation } from './simulator/simulation.types';

export type GraphInferenceInput = {
  graph: DecisionGraphType;
  simulation?: Simulation;
};

export type GraphInferenceResult = {
  nodes: Record<string, { input: VariableTypeJson; output: VariableTypeJson }>;
};

/**
 * Calculates an independent snapshot after ensureWasmLoaded(). Input is the combined parent
 * output before inputField/loop selection. A valid schema, including {}, takes precedence over
 * samples. Otherwise an input-node simulation sample seeds inference through the current graph.
 * Unreachable nodes and unknown or incompatible types are Any. Switches do not narrow types.
 */
export const inferGraphTypes = (input: GraphInferenceInput): GraphInferenceResult => {
  const { nodeTypes } = calculateGraphTypes(input);
  return {
    nodes: Object.fromEntries(
      input.graph.nodes.map(({ id }) => {
        const types = nodeTypes[id];
        return [
          id,
          {
            input: (types[NodeTypeKind.Input] ?? types[NodeTypeKind.InferredInput])!.toJson(),
            output: (types[NodeTypeKind.Output] ?? types[NodeTypeKind.InferredOutput])!.toJson(),
          },
        ];
      }),
    ),
  };
};

type CalculationInput = GraphInferenceInput & {
  customNodes?: DecisionGraphStoreType['state']['customNodes'];
  // Live simulator request types are explicit seeds, not previous inference results.
  inputTypes?: Record<string, VariableType | undefined>;
};

export const calculateGraphTypes = ({ graph, simulation, customNodes = [], inputTypes = {} }: CalculationInput) => {
  const nodeTypes: DecisionGraphStoreType['state']['nodeTypes'] = Object.fromEntries(
    graph.nodes.map(({ id }) => [
      id,
      {
        [NodeTypeKind.InferredInput]: VariableType.fromJson('Any'),
        [NodeTypeKind.InferredOutput]: VariableType.fromJson('Any'),
      },
    ]),
  );
  const ancestors = new Map<string, Set<string>>();
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const trace = new Map(Object.values(simulation?.result?.trace ?? {}).map((entry) => [entry.id, entry]));
  const hasSchema = graph.nodes.some((node) => node.type === 'inputNode' && readSchemaType(node.content?.schema));

  for (const { node, incomers } of createGraphWalker().walk(graph)) {
    if (node.type === 'inputNode') {
      const schema = readSchemaType(node.content?.schema);
      const sample = trace.get(node.id);
      nodeTypes[node.id] = {
        [NodeTypeKind.InferredInput]: VariableType.fromJson('Any'),
        [NodeTypeKind.Output]: schema ?? inputTypes[node.id] ?? new VariableType(sample?.output ?? null),
      };
      if (!schema && !inputTypes[node.id] && !sample) {
        nodeTypes[node.id][NodeTypeKind.Output] = VariableType.fromJson('Any');
      }
      if (inputTypes[node.id]) nodeTypes[node.id][NodeTypeKind.InferredOutput] = inputTypes[node.id];
      ancestors.set(node.id, new Set());
      continue;
    }

    const upstream = new Set<string>();
    for (const parent of incomers) {
      upstream.add(parent.id);
      for (const id of ancestors.get(parent.id) ?? []) upstream.add(id);
    }
    ancestors.set(node.id, upstream);

    const parentTypes = incomers.map(({ id }) => {
      const types = nodeTypes[id];
      return (types[NodeTypeKind.Output] ?? types[NodeTypeKind.InferredOutput])!.clone();
    });
    const input = parentTypes.length === 1 ? parentTypes[0] : VariableType.fromIncoming(parentTypes);
    nodeTypes[node.id][NodeTypeKind.InferredInput] = input;

    const inferTypes =
      nodeSpecification[node.type as NodeKind]?.inferTypes ??
      customNodes.find((specification) => specification.kind === node.type)?.inferTypes;
    if (inferTypes) {
      const $nodes = VariableType.fromJson({ Object: {} });
      for (const id of upstream) {
        const types = nodeTypes[id];
        $nodes.set(nodesById.get(id)!.name, (types[NodeTypeKind.Output] ?? types[NodeTypeKind.InferredOutput])!);
      }
      nodeTypes[node.id][NodeTypeKind.InferredOutput] = inferTypes.determineOutputType({
        input: input.clone(),
        content: node.content,
        globals: { $nodes },
      });
    } else if (!hasSchema) {
      const sample = trace.get(node.id);
      if (sample) {
        nodeTypes[node.id][NodeTypeKind.Input] = new VariableType(sample.input);
        nodeTypes[node.id][NodeTypeKind.Output] = new VariableType(sample.output);
      }
    }
  }

  const $nodes = VariableType.fromJson({ Object: {} });
  for (const node of graph.nodes) {
    const types = nodeTypes[node.id];
    $nodes.set(node.name, (types[NodeTypeKind.Output] ?? types[NodeTypeKind.InferredOutput])!);
  }
  return { nodeTypes, globalType: { $nodes } };
};

const readSchemaType = (schema: unknown): VariableType | undefined => {
  try {
    if (typeof schema !== 'string' || !schema.trim()) return undefined;
    const parsed: unknown = JSON.parse(schema);
    if (typeof parsed === 'boolean' || (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed))) {
      return VariableType.fromJson(jsonSchemaToVariableType(parsed));
    }
  } catch {
    // An incomplete schema must not interrupt inference while editing.
  }
  return undefined;
};
