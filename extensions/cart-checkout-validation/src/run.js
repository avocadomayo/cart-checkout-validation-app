// @ts-check

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 */

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run({cart, validation}) {
  /** @type {Array<{productVariantId: string; quantityLimit: number}>} */
  const configuration = JSON.parse(validation.metafield?.value ?? "{}");
  const errors = [];

  for (const {quantity, merchandise} of cart.lines) {
    if ("id" in merchandise) {
      const limit = configuration[merchandise.id] ?? Infinity;
      const title = merchandise.product.title || "Unknown product"

      if (quantity > limit) {
        errors.push({
          localizedMessage: `Orders are limited to a maximum of ${quantity} of ${title}`,
          target: "cart",
        })
      }
    }
  }

  return {
    errors,
  }
};