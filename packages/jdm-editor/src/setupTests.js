import initZenEngineWasm from '@gorules/zen-engine-wasm';
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';

beforeAll(async () => {
  await initZenEngineWasm();
});

afterEach(() => {
  cleanup();
});
