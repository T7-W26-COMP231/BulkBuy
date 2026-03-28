// frontend/src/api/intentApi.js

import api from './api';

/**
 * Create a purchase intent by reusing POST /orders
 * Backend already supports saving orders with items and status.
 */
export const createIntent = async (intentData) => {
  try {
    const response = await api.post('/orders', intentData);
    return response.data;
  } catch (error) {
    console.error('Error creating intent:', error);
    throw error;
  }
};

/**
 * Helper to build the payload expected by POST /orders
 */
export const buildIntentPayload = ({
  userId,
  productId,
  itemId,
  quantity,
  atInstantPrice,
  discountedPercentage = 0,
  discountBracket = { initial: 0, final: 0 },
  saveForLater = false,
  ops_region = null,
  metadata = {}
}) => {
  return {
    userId,
    items: [
      {
        productId,
        itemId,
        quantity,
        saveForLater,
        pricingSnapshot: {
          atInstantPrice,
          discountedPercentage,
          discountBracket
        }
      }
    ],
    status: 'submitted',
    ...(ops_region ? { ops_region } : {}),
    metadata: {
      source: 'confirm-intent',
      ...metadata
    }
  };
};