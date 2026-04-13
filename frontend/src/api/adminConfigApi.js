import api from "./api";

/**
 * Save admin pricing tiers
 * POST /configs/pricing-tiers
 */
export const savePricingTiers = async (tiers) => {
  try {
    const response = await api.post("/configs/pricing-tiers", {
      tiers,
    });

    return response.data;
  } catch (error) {
    console.error("Error saving pricing tiers:", error);
    throw error;
  }
};