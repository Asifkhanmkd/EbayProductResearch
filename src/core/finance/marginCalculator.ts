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

export interface MarginConfig {
  targetResalePrice: number;
  targetRoi: number;
  postageOverride?: number; // Category-agnostic field to handle custom shipping profiles dynamically
}

export interface FinancialCalculationOutput {
  ebayVariableFee: number;
  ebayFixedFee: number;
  postageCost: number;
  requiredProfit: number;
  maxAllowableSourcingCost: number;
}

/**
 * PURE ECONOMIC ENGINE: Executes margin verification based on numeric parameters alone
 */
export function evaluateSourcingMargins(
  config: MarginConfig,
): FinancialCalculationOutput {
  const resalePrice = config.targetResalePrice;

  // 1. Calculate baseline eBay UK Managed Payments processing overhead
  const ebayVariableFee = resalePrice * 0.135;
  const ebayFixedFee = 0.3;

  // 2. Determine standard postage tiers dynamically based on item valuation bounds
  let postageCost = 3.5; // Standard domestic tracked small parcel rate

  if (resalePrice >= 150.0) {
    postageCost = 7.5; // Premium courier tier with high-value insurance allocation
  }

  // 3. Apply the postage override parameter if an intelligence layer dictates custom specifications
  if (config.postageOverride !== undefined) {
    postageCost = config.postageOverride;
  }

  // 4. Set aside your strict capital return margin target
  const requiredProfit = resalePrice * config.targetRoi;

  // 5. Deduct all fees, postage costs, and target profits from gross revenue to establish your buying ceiling
  const maxAllowableSourcingCost =
    resalePrice - ebayVariableFee - ebayFixedFee - postageCost - requiredProfit;

  return {
    ebayVariableFee,
    ebayFixedFee,
    postageCost,
    requiredProfit,
    maxAllowableSourcingCost: Math.max(0, maxAllowableSourcingCost),
  };
}
