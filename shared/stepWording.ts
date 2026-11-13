/**
 * Pure wording helper for navigation remaining steps.
 * Returns concise, natural step counts:
 * - stepsRemaining > 1: "N steps left"
 * - stepsRemaining === 1: "1 step left"
 * - stepsRemaining === 0: "Last step"
 * - isArrived || stepsRemaining < 0: "Arriving"
 */
export function formatRemainingSteps(stepsRemaining: number, isArrived?: boolean): string {
  if (isArrived || stepsRemaining < 0) {
    return 'Arriving';
  }
  if (stepsRemaining === 0) {
    return 'Last step';
  }
  if (stepsRemaining === 1) {
    return '1 step left';
  }
  return `${stepsRemaining} steps left`;
}
