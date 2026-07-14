"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { cartLineKey, configuredUnitPrice } from "@/lib/cart-line";
import { parseAndValidateCart } from "@/lib/security";
import type { CartLine, CartLineOption, MenuItem, MenuOffer } from "@/lib/types";

// Cart lines are identified by cartLineKey (item + offer + selected options):
// the same item can sit in the cart twice with different configurations
// (Small karak + Large karak). Legacy optionless lines keep the exact same
// dedupe behavior as the old item_id-only keying, so the persisted v2 carts
// stay valid — no storage-key bump.

type CartContextValue = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  isReady: boolean;
  addItem: (item: MenuItem) => void;
  addOffer: (item: MenuItem, offer: MenuOffer) => void;
  addConfiguredLine: (input: {
    item: MenuItem;
    offer?: MenuOffer | null;
    options: CartLineOption[];
    quantity: number;
  }) => void;
  addLines: (lines: CartLine[]) => void;
  incrementOffer: (lineKey: string, offer: MenuOffer) => void;
  increment: (lineKey: string) => void;
  decrement: (lineKey: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

// Total quantity already in the cart for one offer, across ALL configured
// lines. Offer caps are per offer, not per line — the server enforces the
// same aggregate in verifyCartAgainstMenu.
function offerQuantityTotal(lines: CartLine[], offerId: string, excludeKey?: string) {
  return lines.reduce(
    (sum, line) =>
      line.offer_id === offerId && cartLineKey(line) !== excludeKey
        ? sum + line.quantity
        : sum,
    0
  );
}

export function CartProvider({
  restaurantSlug,
  children
}: {
  restaurantSlug: string;
  children: React.ReactNode;
}) {
  const storageKey = `whatsorder-cart-v2-${restaurantSlug}`;
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void Promise.resolve().then(() => {
      if (!isMounted) {
        return;
      }

      try {
        const saved = window.localStorage.getItem(storageKey);

        if (saved) {
          const savedLines = parseAndValidateCart(saved);
          setLines(savedLines);

          if (savedLines.length === 0) {
            window.localStorage.removeItem(storageKey);
          }
        }
      } catch {
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          // Storage may be unavailable entirely; an in-memory cart still works.
        }
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(lines));
    } catch {
      // Keep the active in-memory cart usable when storage is unavailable or full.
    }
  }, [isReady, lines, storageKey]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== storageKey) {
        return;
      }

      if (event.newValue === null) {
        setLines([]);
        return;
      }

      try {
        const nextLines = parseAndValidateCart(event.newValue);
        if (nextLines.length > 0 || event.newValue === "[]") {
          setLines(nextLines);
        }
      } catch {
        // Ignore malformed updates from another tab.
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [storageKey]);

  // Fast path for optionless items: targets the plain (no offer, no options)
  // line only. Option-ful items go through addConfiguredLine via the sheet.
  const addItem = useCallback((item: MenuItem) => {
    setLines((current) => {
      const plainKey = cartLineKey({ item_id: item.id });
      const existing = current.find((line) => cartLineKey(line) === plainKey);

      if (existing) {
        return current.map((line) =>
          cartLineKey(line) === plainKey
            ? { ...line, quantity: line.quantity + 1 }
            : line
        );
      }

      return [
        ...current,
        {
          item_id: item.id,
          name: item.name,
          name_ar: item.name_ar ?? null,
          price: item.price,
          quantity: 1
        }
      ];
    });
  }, []);

  const addOffer = useCallback((item: MenuItem, offer: MenuOffer) => {
    setLines((current) => {
      const offerKey = cartLineKey({ item_id: item.id, offer_id: offer.id });
      const existingOfferLine = current.find(
        (line) => cartLineKey(line) === offerKey
      );

      if (existingOfferLine) {
        const total = offerQuantityTotal(current, offer.id);

        if (total >= offer.max_quantity_per_order) {
          return current;
        }

        return current.map((line) =>
          cartLineKey(line) === offerKey
            ? { ...line, quantity: line.quantity + 1 }
            : line
        );
      }

      if (offerQuantityTotal(current, offer.id) >= offer.max_quantity_per_order) {
        return current;
      }

      // Preserve the old "switching to the offer" behavior for the plain
      // optionless line only: configured lines are distinct products.
      const plainKey = cartLineKey({ item_id: item.id });
      const withoutPlainLine = current.filter(
        (line) => cartLineKey(line) !== plainKey
      );

      return [
        ...withoutPlainLine,
        {
          item_id: item.id,
          offer_id: offer.id,
          offer_max_quantity: offer.max_quantity_per_order,
          name: item.name,
          name_ar: item.name_ar ?? null,
          price: offer.promotional_price,
          quantity: 1
        }
      ];
    });
  }, []);

  // Adds a configured (option-ful) line from the options sheet. Unit price is
  // computed client-side for display; the server re-prices from DB truth.
  const addConfiguredLine = useCallback(
    (input: {
      item: MenuItem;
      offer?: MenuOffer | null;
      options: CartLineOption[];
      quantity: number;
    }) => {
      const { item, offer, options, quantity } = input;

      if (quantity < 1) {
        return;
      }

      setLines((current) => {
        const line: CartLine = {
          item_id: item.id,
          ...(offer
            ? {
                offer_id: offer.id,
                offer_max_quantity: offer.max_quantity_per_order
              }
            : {}),
          name: item.name,
          name_ar: item.name_ar ?? null,
          price: configuredUnitPrice(
            offer ? offer.promotional_price : item.price,
            options
          ),
          quantity,
          ...(options.length > 0 ? { options } : {})
        };
        const key = cartLineKey(line);
        const existing = current.find((entry) => cartLineKey(entry) === key);
        let allowedQuantity = quantity;

        if (offer) {
          const otherLinesTotal = offerQuantityTotal(current, offer.id, key);
          const room =
            offer.max_quantity_per_order -
            otherLinesTotal -
            (existing?.quantity ?? 0);
          allowedQuantity = Math.min(quantity, Math.max(0, room));

          if (allowedQuantity <= 0) {
            return current;
          }
        }

        if (existing) {
          return current.map((entry) =>
            cartLineKey(entry) === key
              ? { ...entry, quantity: entry.quantity + allowedQuantity }
              : entry
          );
        }

        return [...current, { ...line, quantity: allowedQuantity }];
      });
    },
    []
  );

  // Merge a set of historical lines (e.g. "reorder" from a past order) into the
  // cart, summing quantities for configurations already present. Prices and
  // availability are re-validated server-side at order creation.
  const addLines = useCallback((incoming: CartLine[]) => {
    if (incoming.length === 0) {
      return;
    }

    setLines((current) => {
      const merged = [...current];

      for (const line of incoming) {
        const key = cartLineKey(line);
        const index = merged.findIndex((existing) => cartLineKey(existing) === key);

        if (index === -1) {
          merged.push({ ...line });
          continue;
        }

        const cap =
          merged[index].offer_id && merged[index].offer_max_quantity
            ? merged[index].offer_max_quantity ?? Infinity
            : Infinity;
        merged[index] = {
          ...merged[index],
          quantity: Math.min(merged[index].quantity + line.quantity, cap)
        };
      }

      return merged;
    });
  }, []);

  const incrementOffer = useCallback((lineKey: string, offer: MenuOffer) => {
    setLines((current) => {
      if (offerQuantityTotal(current, offer.id) >= offer.max_quantity_per_order) {
        return current;
      }

      return current.map((line) =>
        cartLineKey(line) === lineKey
          ? { ...line, quantity: line.quantity + 1 }
          : line
      );
    });
  }, []);

  const increment = useCallback((lineKey: string) => {
    setLines((current) =>
      current.map((line) => {
        if (cartLineKey(line) !== lineKey) {
          return line;
        }

        if (
          line.offer_id &&
          line.offer_max_quantity &&
          offerQuantityTotal(current, line.offer_id) >= line.offer_max_quantity
        ) {
          return line;
        }

        return { ...line, quantity: line.quantity + 1 };
      })
    );
  }, []);

  const decrement = useCallback((lineKey: string) => {
    setLines((current) =>
      current
        .map((line) =>
          cartLineKey(line) === lineKey
            ? { ...line, quantity: line.quantity - 1 }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
  }, []);

  const clearCart = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({
      lines,
      isReady,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal: lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
      addItem,
      addOffer,
      addConfiguredLine,
      addLines,
      incrementOffer,
      increment,
      decrement,
      clearCart
    }),
    [
      addConfiguredLine,
      addItem,
      addLines,
      addOffer,
      clearCart,
      decrement,
      increment,
      incrementOffer,
      isReady,
      lines
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider.");
  }

  return context;
}
