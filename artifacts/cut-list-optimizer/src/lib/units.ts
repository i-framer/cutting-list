export type Units = 'metric' | 'imperial';

export function parseImperial(raw: string): number {
  const s = raw.trim();
  if (!s) return 0;

  // Feet + inches: 3'6" or 3'6.5" or 3' 6
  const feetInchesExact = s.match(/^(\d+(?:\.\d+)?)'(?:\s*(\d+(?:\.\d+)?)"?)?$/);
  if (feetInchesExact) {
    const feet = parseFloat(feetInchesExact[1] ?? '0');
    const inches = parseFloat(feetInchesExact[2] ?? '0');
    return feet * 12 + inches;
  }

  // Plain feet with apostrophe only (e.g. 3' with no inches part captured above)
  const justFeet = s.match(/^(\d+(?:\.\d+)?)'$/);
  if (justFeet) {
    return parseFloat(justFeet[1]) * 12;
  }

  // Fractional inches: 10-3/4" or 10 3/4
  const fractionalInches = s.match(/^(\d+)\s+(\d+)\/(\d+)"?$/);
  if (fractionalInches) {
    const whole = parseFloat(fractionalInches[1]);
    const num = parseFloat(fractionalInches[2]);
    const den = parseFloat(fractionalInches[3]);
    return whole + (den !== 0 ? num / den : 0);
  }

  // Plain fraction: 3/4"
  const plainFraction = s.match(/^(\d+)\/(\d+)"?$/);
  if (plainFraction) {
    const num = parseFloat(plainFraction[1]);
    const den = parseFloat(plainFraction[2]);
    return den !== 0 ? num / den : 0;
  }

  // Plain number with optional inch mark: 12 or 12.5 or 12.5"
  const plain = s.match(/^(\d+(?:\.\d+)?)"?$/);
  if (plain) return parseFloat(plain[1]);

  const v = parseFloat(s);
  return isNaN(v) ? 0 : v;
}

export function parseValue(raw: string, units: Units): number {
  if (!raw || raw.trim() === '') return 0;
  if (units === 'imperial') return parseImperial(raw);
  const v = parseFloat(raw);
  return isNaN(v) ? 0 : v;
}

export function mmToInches(mm: number): number {
  return mm / 25.4;
}

export function inchesToMm(inches: number): number {
  return inches * 25.4;
}

export function convertDimension(value: number, fromUnits: Units, toUnits: Units): number {
  if (fromUnits === toUnits) return value;
  if (fromUnits === 'metric' && toUnits === 'imperial') return mmToInches(value);
  return inchesToMm(value);
}

export function convertFieldString(raw: string, fromUnits: Units, toUnits: Units): string {
  if (fromUnits === toUnits || raw.trim() === '') return raw;
  const num = parseValue(raw, fromUnits);
  if (num === 0) return raw;
  const converted = convertDimension(num, fromUnits, toUnits);
  return parseFloat(converted.toFixed(4)).toString();
}

export function formatValue(value: number, units: Units, decimals = 2): string {
  if (units === 'imperial') {
    return value.toFixed(decimals) + '"';
  }
  return value.toFixed(decimals);
}

export function unitLabel(units: Units): string {
  return units === 'metric' ? 'mm' : 'in';
}
