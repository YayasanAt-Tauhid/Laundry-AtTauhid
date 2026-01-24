import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LAUNDRY_CATEGORIES, type LaundryCategory } from "@/lib/constants";

// Type for price data from database
export interface LaundryPrice {
  category: LaundryCategory;
  price_per_unit: number;
  unit_name: string;
}

// Type for the prices map (similar to LAUNDRY_CATEGORIES structure)
export type LaundryPricesMap = Record<
  LaundryCategory,
  {
    label: string;
    price: number;
    unit: string;
  }
>;

interface UseLaundryPricesReturn {
  prices: LaundryPricesMap;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getPrice: (category: LaundryCategory) => number;
  isFromDatabase: boolean;
}

/**
 * Hook to fetch laundry prices from the database.
 *
 * SECURITY: Prices should always come from the backend.
 * The backend trigger (validate_and_calculate_order_price) will enforce
 * correct prices regardless, but this hook ensures the frontend displays
 * the same prices that will be used for calculation.
 *
 * Falls back to LAUNDRY_CATEGORIES constants if database fetch fails.
 */
export function useLaundryPrices(): UseLaundryPricesReturn {
  const [prices, setPrices] = useState<LaundryPricesMap>(
    // Initialize with constants as fallback
    Object.fromEntries(
      Object.entries(LAUNDRY_CATEGORIES).map(([key, value]) => [
        key,
        { label: value.label, price: value.price, unit: value.unit },
      ])
    ) as LaundryPricesMap
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromDatabase, setIsFromDatabase] = useState(false);

  const fetchPrices = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("laundry_prices")
        .select("category, price_per_unit, unit_name");

      if (fetchError) {
        console.error("Error fetching laundry prices:", fetchError);
        setError(fetchError.message);
        setIsFromDatabase(false);
        // Keep using the fallback constants
        return;
      }

      if (data && data.length > 0) {
        // Convert database format to map format
        const pricesMap: Partial<LaundryPricesMap> = {};

        for (const item of data) {
          const category = item.category as LaundryCategory;
          // Get label from constants (database doesn't store labels)
          const constantData = LAUNDRY_CATEGORIES[category];

          pricesMap[category] = {
            label: constantData?.label || category,
            price: item.price_per_unit,
            unit: item.unit_name,
          };
        }

        // Merge with constants to ensure all categories are present
        const mergedPrices: LaundryPricesMap = Object.fromEntries(
          Object.entries(LAUNDRY_CATEGORIES).map(([key, value]) => [
            key,
            pricesMap[key as LaundryCategory] || {
              label: value.label,
              price: value.price,
              unit: value.unit,
            },
          ])
        ) as LaundryPricesMap;

        setPrices(mergedPrices);
        setIsFromDatabase(true);

        // Log warning if prices differ from constants
        for (const [key, dbPrice] of Object.entries(pricesMap)) {
          const constantPrice = LAUNDRY_CATEGORIES[key as LaundryCategory]?.price;
          if (constantPrice && dbPrice.price !== constantPrice) {
            console.warn(
              `[useLaundryPrices] Price mismatch for ${key}: ` +
                `DB=${dbPrice.price}, Constant=${constantPrice}. Using DB price.`
            );
          }
        }
      } else {
        console.warn(
          "[useLaundryPrices] No prices found in database, using constants"
        );
        setIsFromDatabase(false);
      }
    } catch (err) {
      console.error("Unexpected error fetching prices:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsFromDatabase(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch prices on mount
  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  // Helper function to get price for a specific category
  const getPrice = useCallback(
    (category: LaundryCategory): number => {
      return prices[category]?.price || LAUNDRY_CATEGORIES[category]?.price || 0;
    },
    [prices]
  );

  return {
    prices,
    isLoading,
    error,
    refetch: fetchPrices,
    getPrice,
    isFromDatabase,
  };
}

/**
 * Sync prices: Compare database prices with constants.
 * Useful for admin to see if constants need updating.
 */
export async function comparePricesWithConstants(): Promise<{
  matches: boolean;
  differences: Array<{
    category: LaundryCategory;
    constantPrice: number;
    databasePrice: number;
  }>;
}> {
  const { data, error } = await supabase
    .from("laundry_prices")
    .select("category, price_per_unit");

  if (error || !data) {
    console.error("Error comparing prices:", error);
    return { matches: false, differences: [] };
  }

  const differences: Array<{
    category: LaundryCategory;
    constantPrice: number;
    databasePrice: number;
  }> = [];

  for (const item of data) {
    const category = item.category as LaundryCategory;
    const constantPrice = LAUNDRY_CATEGORIES[category]?.price;
    const databasePrice = item.price_per_unit;

    if (constantPrice !== databasePrice) {
      differences.push({
        category,
        constantPrice,
        databasePrice,
      });
    }
  }

  return {
    matches: differences.length === 0,
    differences,
  };
}
