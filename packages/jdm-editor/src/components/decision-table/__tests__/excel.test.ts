import { message } from 'antd';
import exceljs from 'exceljs';
import { describe, expect, it, vi } from 'vitest';

import { exportDecisionTable, getExcelData } from '../../../helpers/excel';

vi.mock('../../../helpers/file-helpers', () => ({
  saveFile: vi.fn(),
}));

import { saveFile } from '../../../helpers/file-helpers';

const saveFileMock = vi.mocked(saveFile);

describe('decision table excel io', () => {
  const tableId = '00000000-0000-0000-0000-000000000077';

  it('exports workbook blob with xlsx file name', async () => {
    await exportDecisionTable('my-table', [
      {
        id: 'dt-1',
        name: 'Validation',
        hitPolicy: 'first',
        inputField: undefined,
        outputPath: undefined,
        passThorough: false,
        executionMode: 'single',
        inputs: [{ id: 'in', name: 'Input', field: 'input', defaultValue: '' }],
        outputs: [{ id: 'out', name: 'Output', field: 'output', defaultValue: '' }],
        rules: [{ _id: 'r1', in: 'x', out: 'y', _description: 'rule' }],
      },
    ]);

    expect(saveFileMock).toHaveBeenCalledTimes(1);
    expect(saveFileMock.mock.calls[0]?.[0]).toBe('my-table.xlsx');
    expect(saveFileMock.mock.calls[0]?.[1]).toBeInstanceOf(Blob);
  });

  it('reads worksheet into decision table nodes', async () => {
    const workbook = new exceljs.Workbook();
    const ws = workbook.addWorksheet('Imported Table');

    ws.addRow([tableId]);
    ws.addRow(['Inputs', 'Outputs', '']);

    const header = ws.addRow(['Input', 'Output', 'DESCRIPTION']);
    header.getCell(1).note = JSON.stringify({ id: 'in', name: 'input', type: 'input' });
    header.getCell(2).note = JSON.stringify({ id: 'out', name: 'output', type: 'output' });

    ws.addRow(['a > 1', 'true', 'sample']);

    const buffer = await workbook.xlsx.writeBuffer();
    const result = await getExcelData(buffer as ArrayBuffer);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(tableId);
    expect(result[0]?.name).toBe('Imported Table');
    expect(result[0]?.headers[0]).toMatchObject({ id: 'in', name: 'Input', value: 'input', _type: 'input' });
    expect(result[0]?.headers[1]).toMatchObject({ id: 'out', name: 'Output', value: 'output', _type: 'output' });
    expect(result[0]?.rules[0]).toMatchObject([
      { headerId: 'in', value: 'a > 1' },
      { headerId: 'out', value: 'true' },
      { headerId: '_description', value: 'sample' },
    ]);
  });

  it('recovers from malformed header metadata and still returns parsed structure', async () => {
    const errorSpy = vi.spyOn(message, 'error');

    const workbook = new exceljs.Workbook();
    const ws = workbook.addWorksheet('Bad Header');

    ws.addRow(['00000000-0000-0000-0000-000000000bad']);
    ws.addRow(['Inputs', 'Outputs', '']);

    const header = ws.addRow(['Input', 'Output', 'DESCRIPTION']);
    header.getCell(1).note = '{bad-json';
    header.getCell(2).note = JSON.stringify({ id: 'out', name: 'output', type: 'output' });

    ws.addRow(['x', 'ok', '']);

    const buffer = await workbook.xlsx.writeBuffer();
    const result = await getExcelData(buffer as ArrayBuffer);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Bad Header');

    errorSpy.mockRestore();
  });
});
