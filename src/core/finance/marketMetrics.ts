export interface FeesModel {
  variableFeeRate: number;
  fixedFee: number;
  postageCost: number;
  targetRoi: number;
}

export interface CashCalculation {
  ebayVariableFee: number;
  ebayFixedFee: number;
  postageCost: number;
  requiredProfit: number;
  maxBuyCeiling: number;
  netProfit: number;
}

const DEFAULT_FEES_MODEL: FeesModel = {
  variableFeeRate: 0.135,
  fixedFee: 0.3,
  postageCost: 3.5,
  targetRoi: 0.1,
};

export function computeSellThrough(
  soldCount: number,
  activeCount: number,
): number {
  const safeSold = Math.max(0, soldCount);
  const safeActive = Math.max(0, activeCount);
  const denominator = safeSold + safeActive;

  if (denominator === 0) return 0;

  return safeSold / denominator;
}

export function computePriceBias(
  medianAsk: number,
  medianSold: number,
): number {
  if (medianSold <= 0) return 0;

  return (medianAsk - medianSold) / medianSold;
}

export function computeMaxBuyCeiling(
  realizedValue: number,
  feesModel: FeesModel = DEFAULT_FEES_MODEL,
): number {
  if (realizedValue <= 0) return 0;

  const ebayVariableFee = realizedValue * feesModel.variableFeeRate;
  const requiredProfit = realizedValue * feesModel.targetRoi;
  const ceiling =
    realizedValue -
    ebayVariableFee -
    feesModel.fixedFee -
    feesModel.postageCost -
    requiredProfit;

  return Math.max(0, ceiling);
}

export function computeProgrammaticCash(
  wholesaleCost: number,
  realizedValue: number,
  feesModel: FeesModel = DEFAULT_FEES_MODEL,
): CashCalculation {
  const ebayVariableFee = Math.max(0, realizedValue) * feesModel.variableFeeRate;
  const requiredProfit = Math.max(0, realizedValue) * feesModel.targetRoi;
  const maxBuyCeiling = computeMaxBuyCeiling(realizedValue, feesModel);
  const netProfit =
    Math.max(0, realizedValue) -
    ebayVariableFee -
    feesModel.fixedFee -
    feesModel.postageCost -
    Math.max(0, wholesaleCost);

  return {
    ebayVariableFee,
    ebayFixedFee: feesModel.fixedFee,
    postageCost: feesModel.postageCost,
    requiredProfit,
    maxBuyCeiling,
    netProfit,
  };
}
