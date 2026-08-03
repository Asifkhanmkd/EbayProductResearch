/* export interface SourcingInput {
  targetResalePrice: number;

  targetRoi: number;
}

export interface SourcingEvaluation {
  targetResalePrice: number;

  ebayVariableFee: number;

  ebayFixedFee: number;

  postageCost: number;

  requiredProfit: number;

  maxAllowableSourcingCost: number;
}


  //Category-Agnostic Financial Margin Engine
 
export function evaluateSourcingMargins(
  input: SourcingInput,
): SourcingEvaluation {
  const {
    targetResalePrice,
    targetRoi,
  } = input;

  // =====================================
  // EBAY UK MANAGED PAYMENTS FEES
  // =====================================

  const ebayVariableFee =
    targetResalePrice * 0.135;

  const ebayFixedFee = 0.30;

  const totalEbayFees =
    ebayVariableFee + ebayFixedFee;

  // =====================================
  // DYNAMIC SHIPPING TIER
  // =====================================

  const postageCost =
    targetResalePrice >= 150
      ? 7.5
      : 3.5;

  // =====================================
  // REQUIRED PROFIT BUFFER
  // =====================================

  const requiredProfit =
    targetResalePrice * targetRoi;

  // =====================================
  // MAX ALLOWABLE SOURCING COST
  // =====================================

  const maxAllowableSourcingCost =
    targetResalePrice -
    totalEbayFees -
    postageCost -
    requiredProfit;

  return {
    targetResalePrice,

    ebayVariableFee,

    ebayFixedFee,

    postageCost,

    requiredProfit,

    maxAllowableSourcingCost:
      maxAllowableSourcingCost > 0
        ? maxAllowableSourcingCost
        : 0,
  };
} */

// The above code written by chatGPT is replaced by the code given below written by Gemini

/* export interface SourcingInput {
  targetResalePrice: number;
  targetRoi: number;
  chargeBuyerForShipping?: number; // Optional input if you charge shipping on top of item price
}

export interface SourcingEvaluation {
  targetResalePrice: number;
  ebayVariableFee: number;
  ebayFixedFee: number;
  postageCost: number;
  requiredProfit: number;
  maxAllowableSourcingCost: number;
}


 // Category-Agnostic Financial Margin Engine (UK Marketplace Optimized)
 
export function evaluateSourcingMargins(
  input: SourcingInput,
): SourcingEvaluation {
  const {
    targetResalePrice,
    targetRoi,
    chargeBuyerForShipping = 0, // Defaults to 0 (Assuming Free Postage model)
  } = input;

  // =====================================
  // DYNAMIC SHIPPING TIER (Internal Cost)
  // =====================================
  // Dynamic threshold tracking to determine your actual delivery expenses
  const postageCost = targetResalePrice >= 150 ? 7.5 : 3.5;

  

  // =====================================
  // TRUE EBAY UK MANAGED PAYMENTS FEES
  // =====================================
  // Crucial Fix: Fees are calculated on (Price + Shipping Revenue received from buyer)
  const totalGrossRevenue = targetResalePrice + chargeBuyerForShipping;

  const ebayVariableFee = totalGrossRevenue * 0.135;
  const ebayFixedFee = 0.3;
  const totalEbayFees = ebayVariableFee + ebayFixedFee;

  // =====================================
  // REQUIRED PROFIT BUFFER (ROI Anchor)
  // =====================================
  const requiredProfit = targetResalePrice * targetRoi;

  // =====================================
  // IRONCLAD MAX ALLOWABLE SOURCING COST
  // =====================================
  // Total Money In minus all platform fees, real delivery outlays, and target profit
  const maxAllowableSourcingCost =
    totalGrossRevenue - totalEbayFees - postageCost - requiredProfit;

  return {
    targetResalePrice,
    ebayVariableFee,
    ebayFixedFee,
    postageCost,
    requiredProfit,
    maxAllowableSourcingCost:
      maxAllowableSourcingCost > 0 ? maxAllowableSourcingCost : 0,
  };
}
 */

export interface FeeModel {
  categoryFeePercent: number;
  fixedFee: number;
  postageEstimate: number;
  promotedListingsPercent?: number;
}

export const DEFAULT_FEE_MODEL: FeeModel = {
  categoryFeePercent: 0.135,
  fixedFee: 0.3,
  postageEstimate: 3.5,
  promotedListingsPercent: 0,
};

export interface MarginConfig {
  targetResalePrice: number;
  targetRoi: number;
  postageOverride?: number;
  feeModel?: Partial<FeeModel>;
}

export interface FinancialCalculationOutput {
  ebayVariableFee: number;
  ebayFixedFee: number;
  postageCost: number;
  promotedListingFee: number;
  requiredProfit: number;
  maxAllowableSourcingCost: number;
}

/**
 * Calculates the MASC / Max Buy Ceiling.
 * PROGRAMMATIC_CASH is calculated downstream as realizedValue - fees - postage - wholesaleCost.
 * The ceiling additionally reserves target ROI so bids stay below the maximum safe sourcing cost.
 */
export function evaluateSourcingMargins(
  config: MarginConfig,
): FinancialCalculationOutput {
  const resalePrice = Math.max(0, config.targetResalePrice);
  const feeModel: FeeModel = {
    ...DEFAULT_FEE_MODEL,
    ...config.feeModel,
    postageEstimate: config.postageOverride ?? config.feeModel?.postageEstimate ?? DEFAULT_FEE_MODEL.postageEstimate,
  };

  const ebayVariableFee = resalePrice * feeModel.categoryFeePercent;
  const ebayFixedFee = feeModel.fixedFee;
  const promotedListingFee = resalePrice * (feeModel.promotedListingsPercent ?? 0);
  const postageCost = feeModel.postageEstimate;
  const requiredProfit = resalePrice * config.targetRoi;
  const maxAllowableSourcingCost =
    resalePrice - ebayVariableFee - ebayFixedFee - promotedListingFee - postageCost - requiredProfit;

  return {
    ebayVariableFee,
    ebayFixedFee,
    postageCost,
    promotedListingFee,
    requiredProfit,
    maxAllowableSourcingCost: Math.max(0, maxAllowableSourcingCost),
  };
}
