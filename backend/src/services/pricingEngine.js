function computePricingTier(item, aggregatedDemand = 0) {
  const tiers = Array.isArray(item?.pricingTiers)
    ? [...item.pricingTiers].sort((a, b) => a.minQty - b.minQty)
    : [];

  const basePriceObj =
    Array.isArray(item?.price) && item.price.length > 0 ? item.price[0] : null;

  const baseListPrice = basePriceObj?.list ?? 0;
  const baseSalePrice = basePriceObj?.sale ?? null;
  const baseDisplayPrice = baseSalePrice ?? baseListPrice;
  const currency =
    tiers[0]?.currency || basePriceObj?.currency || "CAD";

  let activeTier = null;
  for (const tier of tiers) {
    if (aggregatedDemand >= tier.minQty) activeTier = tier;
  }

  if (!activeTier && tiers.length > 0) {
    activeTier = tiers[0];
  }

  const activeTierIndex = activeTier
    ? tiers.findIndex((t) => t.minQty === activeTier.minQty)
    : -1;

  const nextTier =
    activeTierIndex >= 0 && activeTierIndex < tiers.length - 1
      ? tiers[activeTierIndex + 1]
      : null;

  const currentUnitPrice = activeTier?.price ?? baseDisplayPrice;

  const estimatedSavings =
    baseListPrice > currentUnitPrice
      ? Number((baseListPrice - currentUnitPrice).toFixed(2))
      : 0;

  let progressPercent = 0;
  if (nextTier) {
    progressPercent = Math.min(
      (aggregatedDemand / nextTier.minQty) * 100,
      100
    );
  } else {
    progressPercent = tiers.length > 0 ? 100 : 0;
  }

  return {
    aggregatedDemand,
    currentUnitPrice,
    currency,
    activeTier,
    nextTier,
    nextThresholdQty: nextTier?.minQty ?? null,
    progressPercent,
    estimatedSavings,
    tiers
  };
}

module.exports = { computePricingTier };