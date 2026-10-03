export const PROPOSED_COST_CEILING_USD = 0.25;
export const L2_PLANNING_TOTAL_PROVIDER_COST_USD = 0.480294;
export const HARD_L2_COST_BOUND_FEASIBLE = 'BLOCKED';
export const MAX_TYPESAFE_INPUT_TOKENS_PER_REQ = 1000;
export const TYPESAFE_PRICE_PER_BTOK = 42;

export const TYPESAFE_HISTORICAL_PROJECTED_COST_USD = Number(
  (((7 * MAX_TYPESAFE_INPUT_TOKENS_PER_REQ) / 1_000_000_000) * TYPESAFE_PRICE_PER_BTOK).toFixed(6),
);
export const MAX_PROJECTED_TYPESAFE_COST_USD = TYPESAFE_HISTORICAL_PROJECTED_COST_USD;

export function parseCostCeiling(customArgs, customEnv) {
  const envVal = (customEnv ?? process.env).L2_COST_CEILING_USD;
  const args = customArgs ?? process.argv.slice(2);
  let rawVal = envVal;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cost-ceiling' && args[i + 1]) {
      rawVal = args[i + 1];
      break;
    }
  }
  if (!rawVal) {
    throw new Error(
      'FATAL: Cost ceiling not provided. Set L2_COST_CEILING_USD or pass --cost-ceiling <number>.',
    );
  }
  const num = Number(rawVal);
  if (Number.isNaN(num) || num <= 0) {
    throw new Error('FATAL: Approved cost ceiling must be a positive number.');
  }
  return num;
}

export function resolveCostCeiling(options) {
  if (options.costCeilingUsd !== undefined) return options.costCeilingUsd;
  const args = options.customArgs;
  if (args) {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--cost-ceiling' && args[i + 1]) return args[i + 1];
    }
  }
  if (options.acceptTypesafeEmpiricalPricing) {
    throw new Error(
      'FATAL_LIVE_PREAUTH_BLOCKED: Explicit per-run cost ceiling required for empirical TypeSafe pricing. Pass --cost-ceiling <number> or supply costCeilingUsd (environment variable L2_COST_CEILING_USD is not accepted for empirical pricing).',
    );
  }
  return parseCostCeiling(options.customArgs, options.customEnv);
}
