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
  const storageKey = `whatsorder-cart-${restaurantSlug}`;
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
        return current.map((line) =>
          line.item_id === item.id
            ? {
                ...line,
                name: item.name,
                name_ar: item.name_ar ?? null,
                offer_id: offer.id,
                price: offer.promotional_price,
                quantity: line.quantity + 1
              }
            : line
        );
      }

      return [
        ...current,
        {
          item_id: item.id,
          offer_id: offer.id,
          name: item.name,
          name_ar: item.name_ar ?? null,
          price: offer.promotional_price,
          quantity: 1
        }
      ];
    });
  }, []);

  const increment = useCallback((itemId: string) => {
    setLines((current) =>
      current.map((line) =>
        line.item_id === itemId ? { ...line, quantity: line.quantity + 1 } : line
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
      increment,
      decrement,
      clearCart
    }),
    [addItem, addOffer, clearCart, decrement, increment, isReady, lines]
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
