/**
 * Measurement Utilities
 *
 * Helpers for handling CSS measurement values (px, rem, em, %, etc.)
 */

import { getDefaultMeasurementUnit } from './tailwind-class-mapper';

/**
 * Extract value from design property for display in inputs.
 * Strips the current default unit suffix so the input shows a bare number.
 */
export function extractMeasurementValue(value: string): string {
  if (!value) return '';

  const specialValues = ['auto', 'full', 'screen', 'fit', 'min', 'max'];
  if (specialValues.includes(value)) return value;

  const unit = getDefaultMeasurementUnit();
  if (unit && value.endsWith(unit)) {
    return value.slice(0, -unit.length);
  }
  // Fallback: always strip 'px' for backward compat when unit is different
  if (value.endsWith('px')) {
    return value.slice(0, -2);
  }

  return value;
}

/**
 * Format a measurement value
 * Strips spaces to ensure valid Tailwind syntax
 * The value is stored exactly as typed (minus spaces), tailwind-class-mapper handles px defaults
 * 
 * @param value - The value from the input
 * @returns The value to store (without spaces)
 * 
 * @example
 * formatMeasurementValue("100") // "100"
 * formatMeasurementValue("100px") // "100px"
 * formatMeasurementValue("10 rem") // "10rem" (spaces stripped)
 * formatMeasurementValue("10 0 px") // "100px" (spaces stripped)
 */
export function formatMeasurementValue(value: string): string | null {
  if (!value) return null;
  // Strip all spaces to ensure valid Tailwind class syntax
  return value.replace(/\s+/g, '');
}
