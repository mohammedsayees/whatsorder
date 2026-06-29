"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { CartLine, MenuItem, MenuOffer } from "@/lib/types";

type CartContextValue = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  isReady: boolean;
  addItem: (item: MenuItem) => void;
  addOffer: (item: MenuItem, offer: MenuOffer) => void;
  addLines: (lines: CartLine[]) => void;
  incrementOffer: (itemId: string, offer: MenuOffer) => void;
  increment: (itemId: string) => void;
  decrement: (itemId: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

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

      const saved = window.localStorage.getItem(storageKey);

      if (saved) {
        setLines(JSON.parse(saved) as CartLine[]);
      }

      setIsReady(true);
    });

    return () => {
      isMounted = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(lines));
  }, [isReady, lines, storageKey]);

  const addItem = useCallback((item: MenuItem) => {
    setLines((current) => {
      const existing = current.find((line) => line.item_id === item.id);

      if (existing) {
        if (
          existing.offer_id &&
          existing.offer_max_quantity &&
          existing.quantity >= existing.offer_max_quantity
        ) {
          return current;
        }

        return current.map((line) =>
          line.item_id === item.id ? { ...line, quantity: line.quantity + 1 } : line
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
      const existing = current.find((line) => line.item_id === item.id);

      if (existing) {
        if (
          existing.offer_id === offer.id &&
          existing.quantity >= offer.max_quantity_per_order
        ) {
          return current;
        }

        return current.map((line) =>
          line.item_id === item.id
            ? {
                ...line,
                name: item.name,
                name_ar: item.name_ar ?? null,
                offer_id: offer.id,
                offer_max_quantity: offer.max_quantity_per_order,
                price: offer.promotional_price,
                quantity:
                  line.offer_id === offer.id
                    ? Math.min(line.quantity + 1, offer.max_quantity_per_order)
                    : 1
              }
            : line
        );
      }

      return [
        ...current,
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

  // Merge a set of historical lines (e.g. "reorder" from a past order) into the
  // cart, summing quantities for items already present. Prices/availability are
  // re-validated server-side at order creation, so we trust the saved snapshot
  // here only for a fast "add to cart" UX.
  const addLines = useCallback((incoming: CartLine[]) => {
    if (incoming.length === 0) {
      return;
    }

    setLines((current) => {
      const merged = [...current];

      for (const line of incoming) {
        const index = merged.findIndex((existing) => existing.item_id === line.item_id);

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

  const incrementOffer = useCallback((itemId: string, offer: MenuOffer) => {
    setLines((current) =>
      current.map((line) =>
        line.item_id === itemId &&
        line.offer_id === offer.id &&
        line.quantity < offer.max_quantity_per_order
          ? { ...line, quantity: line.quantity + 1 }
          : line
      )
    );
  }, []);

  const increment = useCallback((itemId: string) => {
    setLines((current) =>
      current.map((line) =>
        line.item_id === itemId &&
        (!line.offer_id ||
          !line.offer_max_quantity ||
          line.quantity < line.offer_max_quantity)
          ? { ...line, quantity: line.quantity + 1 }
          : line
      )
    );
  }, []);

  const decrement = useCallback((itemId: string) => {
    setLines((current) =>
      current
        .map((line) =>
          line.item_id === itemId ? { ...line, quantity: line.quantity - 1 } : line
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
      addLines,
      incrementOffer,
      increment,
      decrement,
      clearCart
    }),
    [addItem, addLines, addOffer, clearCart, decrement, increment, incrementOffer, isReady, lines]
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
