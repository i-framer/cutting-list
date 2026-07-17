import { parseCuttingList } from './importParser';

// Simple test runner — run with: npx tsx importParser.test.ts
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error('  ', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}

function expect(val: unknown) {
  return {
    toBe(expected: unknown) {
      if (val !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`);
    },
    toEqual(expected: unknown) {
      if (JSON.stringify(val) !== JSON.stringify(expected))
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`);
    },
    toHaveLength(n: number) {
      if ((val as unknown[]).length !== n)
        throw new Error(`Expected length ${n}, got ${(val as unknown[]).length}: ${JSON.stringify(val)}`);
    },
  };
}

// ---------- Section-format tests ----------

test('basic section format: 2 materials, 3 jobs', () => {
  const text = `
3mm MDF
WPF-52331 600x400
WPF-52332-2 800x600

FBCT540X60
WPF-52333 540x60
`.trim();
  const { rows, materials, errors } = parseCuttingList(text);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toEqual({ label: 'WPF-52331', length: '600', width: '400', qty: '1', material: '3mm MDF' });
  expect(rows[1]).toEqual({ label: 'WPF-52332-2', length: '800', width: '600', qty: '2', material: '3mm MDF' });
  expect(rows[2]).toEqual({ label: 'WPF-52333', length: '540', width: '60', qty: '1', material: 'FBCT540X60' });
  expect(materials).toEqual(['3mm MDF', 'FBCT540X60']);
  expect(errors).toHaveLength(0);
});

test('handles mm unit suffix on dimensions', () => {
  const text = `
3mm MDF
WPF-52331 600mm x 400mm
WPF-52332 715mm x 330mm
`.trim();
  const { rows } = parseCuttingList(text);
  expect(rows).toHaveLength(2);
  expect(rows[0].length).toBe('600');
  expect(rows[0].width).toBe('400');
  expect(rows[1].length).toBe('715');
  expect(rows[1].width).toBe('330');
});

test('handles tab-separated columns', () => {
  const text = '3mm MDF\nWPF-52331\t600\t400\nWPF-52332-2\t800\t600';
  const { rows } = parseCuttingList(text);
  expect(rows).toHaveLength(2);
  expect(rows[0].label).toBe('WPF-52331');
  expect(rows[0].length).toBe('600');
  expect(rows[0].width).toBe('400');
  expect(rows[1].qty).toBe('2');
});

test('handles × (multiplication sign) as dimension separator', () => {
  const text = '3mm MDF\nWPF-52331 600×400';
  const { rows } = parseCuttingList(text);
  expect(rows).toHaveLength(1);
  expect(rows[0].length).toBe('600');
  expect(rows[0].width).toBe('400');
});

test('board header detection: skips digit-leading lines', () => {
  const text = '3mm MDF\nWPF-52331 600x400\n1 job\nTotal: 1';
  const { rows } = parseCuttingList(text);
  // "1 job" and "Total: 1" should NOT become board codes
  expect(rows).toHaveLength(1);
  expect(rows[0].material).toBe('3mm MDF');
});

test('board header detection: skips colon lines', () => {
  const text = '3mm MDF\nWPF-52331 600x400\nPage: 1 of 2\nWPF-52332 800x600';
  const { rows } = parseCuttingList(text);
  expect(rows).toHaveLength(2);
  expect(rows[1].material).toBe('3mm MDF'); // material unchanged
});

test('qty defaults to 1 when no suffix', () => {
  const text = '3mm MDF\nWPF-52331 600x400';
  const { rows } = parseCuttingList(text);
  expect(rows[0].qty).toBe('1');
});

test('qty extracted from job number suffix', () => {
  const text = '3mm MDF\nWPF-52331-3 600x400';
  const { rows } = parseCuttingList(text);
  expect(rows[0].qty).toBe('3');
  expect(rows[0].label).toBe('WPF-52331-3');
});

// ---------- CSV format tests ----------

test('CSV with named column headers', () => {
  const text = 'Job,Width,Height,Material\nWPF-52331,600,400,3mm MDF\nWPF-52332-2,800,600,3mm MDF';
  const { rows, materials } = parseCuttingList(text);
  expect(rows).toHaveLength(2);
  expect(rows[0].label).toBe('WPF-52331');
  expect(rows[0].length).toBe('600');
  expect(rows[0].material).toBe('3mm MDF');
  expect(materials).toEqual(['3mm MDF']);
});

test('CSV with qty suffix in job column', () => {
  const text = 'Job,Width,Height,Material\nWPF-52331-2,600,400,3mm MDF';
  const { rows } = parseCuttingList(text);
  expect(rows[0].qty).toBe('2');
  expect(rows[0].label).toBe('WPF-52331-2');
});

test('CSV with extra unrecognised columns', () => {
  const text = 'Item,Job,Width,Height,Material,Notes\n1,WPF-52331,600,400,3mm MDF,rush order\n2,WPF-52332,800,600,3mm MDF,';
  const { rows } = parseCuttingList(text);
  expect(rows).toHaveLength(2);
  expect(rows[0].label).toBe('WPF-52331');
  expect(rows[0].length).toBe('600');
  expect(rows[0].width).toBe('400');
  expect(rows[0].material).toBe('3mm MDF');
});

test('CSV with explicit Qty column', () => {
  const text = 'Job,Width,Height,Qty,Material\nWPF-52331,600,400,5,3mm MDF';
  const { rows } = parseCuttingList(text);
  expect(rows[0].qty).toBe('5');
});

test('semicolon-delimited CSV', () => {
  const text = 'Job;Width;Height;Material\nWPF-52331;600;400;3mm MDF\nWPF-52332;800;600;3mm MDF';
  const { rows, materials } = parseCuttingList(text);
  expect(rows).toHaveLength(2);
  expect(rows[0].length).toBe('600');
  expect(materials).toEqual(['3mm MDF']);
});

test('tab-delimited file with header row', () => {
  const text = 'Job\tWidth\tHeight\tMaterial\nWPF-52331\t600\t400\t3mm MDF';
  const { rows } = parseCuttingList(text);
  expect(rows).toHaveLength(1);
  expect(rows[0].label).toBe('WPF-52331');
  expect(rows[0].material).toBe('3mm MDF');
});

test('CSV with quoted fields containing commas', () => {
  const text = 'Job,Width,Height,Material\nWPF-52331,600,400,"MDF, 3mm, white"';
  const { rows } = parseCuttingList(text);
  expect(rows).toHaveLength(1);
  expect(rows[0].material).toBe('MDF, 3mm, white');
});

test('CSV rows missing dimensions produce a clear error', () => {
  const text = 'Job,Width,Height,Material\nWPF-52331,,400,3mm MDF';
  const { rows, errors } = parseCuttingList(text);
  expect(rows).toHaveLength(0);
  expect(errors).toHaveLength(1);
  expect(errors[0].includes('WPF-52331')).toBe(true);
});

// ---------- Separator variants ----------

test('handles * as dimension separator', () => {
  const text = '3mm MDF\nWPF-52331 600*400';
  const { rows } = parseCuttingList(text);
  expect(rows).toHaveLength(1);
  expect(rows[0].length).toBe('600');
  expect(rows[0].width).toBe('400');
});

test('handles comma as dimension separator (section format)', () => {
  const text = '3mm MDF\nWPF-52331 600,400\nWPF-52332-2 800, 600';
  const { rows } = parseCuttingList(text);
  expect(rows).toHaveLength(2);
  expect(rows[0].length).toBe('600');
  expect(rows[0].width).toBe('400');
  expect(rows[1].length).toBe('800');
  expect(rows[1].width).toBe('600');
  expect(rows[1].qty).toBe('2');
  expect(rows[0].material).toBe('3mm MDF');
});

test('single comma dimension separator does not trigger CSV mode', () => {
  const text = '3mm MDF\nWPF-52331 600,400\nWPF-52332 800,600\nWPF-52333 540,60';
  const { rows, materials } = parseCuttingList(text);
  expect(rows).toHaveLength(3);
  expect(materials).toEqual(['3mm MDF']);
});

// ---------- Warning clarity ----------

test('unrecognised line surfaces a warning including the line content', () => {
  const text = '3mm MDF\nWPF-52331 600x400\n42 gibberish entry';
  const { rows, errors } = parseCuttingList(text);
  expect(rows).toHaveLength(1);
  expect(errors).toHaveLength(1);
  expect(errors[0].includes('42 gibberish entry')).toBe(true);
  expect(errors[0].includes('Not recognised')).toBe(true);
});

test('job number without dimensions gets a specific warning', () => {
  const text = '3mm MDF\nWPF-52331';
  const { rows, errors } = parseCuttingList(text);
  expect(rows).toHaveLength(0);
  expect(errors).toHaveLength(1);
  expect(errors[0].includes('WPF-52331')).toBe(true);
  expect(errors[0].includes('no dimensions')).toBe(true);
});

test('headerless CSV rows still parse as job lines', () => {
  const text = 'WPF-52331,600,400\nWPF-52332-2,800,600';
  const { rows } = parseCuttingList(text);
  expect(rows).toHaveLength(2);
  expect(rows[0].label).toBe('WPF-52331');
  expect(rows[0].length).toBe('600');
  expect(rows[1].qty).toBe('2');
});

console.log('\nAll tests done.');
