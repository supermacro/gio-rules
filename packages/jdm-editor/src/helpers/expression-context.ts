import { VariableType } from '@gorules/zen-engine-wasm';

type ExpressionContextOptions = {
  inputField?: string | null;
  executionMode?: 'single' | 'loop';
  globals?: Record<string, VariableType>;
};

/** Applies input selection and loop scope while keeping globals available to the checker. */
export const createExpressionContext = (
  input: VariableType,
  { inputField, executionMode, globals }: ExpressionContextOptions = {},
) => {
  let context = attachGlobals(input.clone(), globals);
  if (inputField) context = context.calculateType(inputField);
  if (executionMode === 'loop') context = context.arrayItem();
  return attachGlobals(context, globals);
};

const attachGlobals = (input: VariableType, globals?: Record<string, VariableType>) => {
  if (!globals) return input;
  // The WASM checker treats a property read on Any as Null. Use an open context instead.
  const context = input.toJson() === 'Any' ? VariableType.fromJson({ Object: {} }) : input;
  Object.entries(globals).forEach(([key, type]) => context.set(key, type));
  return context;
};
