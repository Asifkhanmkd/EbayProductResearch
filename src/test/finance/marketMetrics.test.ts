import assert from "node:assert/strict";
import {
  computeMaxBuyCeiling,
  computePriceBias,
  computeProgrammaticCash,
  computeSellThrough,
  formatSellThroughLabel,
} from "../../core/finance/marketMetrics";

function approx(actual: number, expected: number, precision = 0.0001) {
  assert.ok(
    Math.abs(actual - expected) <= precision,
    `expected ${actual} to be within ${precision} of ${expected}`,
  );
}

const waterpikStr = computeSellThrough(59, 47);
approx(waterpikStr, 59 / 106);
assert.equal(formatSellThroughLabel(waterpikStr), "Live Market STR: 55.7%");
assert.equal(computeSellThrough(0, 47), 0);
assert.equal(computeSellThrough(10, 0), 1);
assert.equal(computeSellThrough(0, 0), 0);

approx(computePriceBias(47.99, 19.99), (47.99 - 19.99) / 19.99);
assert.equal(computePriceBias(47.99, 0), 0);

const feesModel = {
  variableFeeRate: 0.135,
  fixedFee: 0.3,
  postageCost: 3.5,
  targetRoi: 0.1,
};
approx(computeMaxBuyCeiling(21, feesModel), 12.265);

const cash = computeProgrammaticCash(5.63, 21, feesModel);
approx(cash.netProfit, 8.735);
approx(cash.maxBuyCeiling, 12.265);

console.log("marketMetrics tests passed");
