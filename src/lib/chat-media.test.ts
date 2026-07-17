import { describe, expect, it } from "vitest";
import {
  chatMediaPath,
  isChatMediaPathForRestaurant
} from "@/lib/chat-media";

describe("chat media tenant paths", () => {
  const restaurantId = "11111111-1111-1111-1111-111111111111";

  it("namespaces sanitized message ids under the restaurant", () => {
    expect(chatMediaPath(restaurantId, "wamid.ABC=/+")).toBe(
      `${restaurantId}/wamid_ABC___`
    );
  });

  it("accepts only non-empty paths in the authenticated restaurant namespace", () => {
    expect(
      isChatMediaPathForRestaurant(restaurantId, `${restaurantId}/wamid_ABC`)
    ).toBe(true);
    expect(isChatMediaPathForRestaurant(restaurantId, `${restaurantId}/`)).toBe(
      false
    );
    expect(
      isChatMediaPathForRestaurant(
        restaurantId,
        "22222222-2222-2222-2222-222222222222/wamid_ABC"
      )
    ).toBe(false);
    expect(
      isChatMediaPathForRestaurant(
        restaurantId,
        `${restaurantId}/../22222222-2222-2222-2222-222222222222/wamid_ABC`
      )
    ).toBe(false);
  });
});
