import { describe, expect, it } from "vitest";

import { ownedStoragePath, storagePathFromPublicUrl } from "./storage-ownership";

const base = "https://proj.supabase.co/storage/v1/object/public";

describe("storagePathFromPublicUrl", () => {
  it("extracts and decodes the path", () => {
    expect(
      storagePathFromPublicUrl(`${base}/menu-images/restaurants/a/karak%20tea.jpg?v=1`, "menu-images")
    ).toBe("restaurants/a/karak tea.jpg");
  });

  it("ignores other buckets, foreign URLs and bad encoding", () => {
    expect(storagePathFromPublicUrl(`${base}/menu-images/x.jpg`, "restaurant-assets")).toBeNull();
    expect(storagePathFromPublicUrl("https://example.com/x.jpg", "menu-images")).toBeNull();
    expect(storagePathFromPublicUrl(`${base}/menu-images/%E0%A4%A`, "menu-images")).toBeNull();
  });
});

describe("ownedStoragePath", () => {
  it("allows files inside the tenant folder", () => {
    expect(
      ownedStoragePath(`${base}/menu-images/restaurants/chaixpress/tea-1.jpg`, "menu-images", "chaixpress")
    ).toBe("restaurants/chaixpress/tea-1.jpg");
    expect(
      ownedStoragePath(`${base}/restaurant-assets/restaurants/uuid-1/logo-1.png`, "restaurant-assets", "uuid-1")
    ).toBe("restaurants/uuid-1/logo-1.png");
  });

  it("refuses another tenant's files", () => {
    expect(
      ownedStoragePath(`${base}/menu-images/restaurants/other/tea.jpg`, "menu-images", "chaixpress")
    ).toBeNull();
    // Prefix lookalike: "chaixpress-2" must not match "chaixpress".
    expect(
      ownedStoragePath(`${base}/menu-images/restaurants/chaixpress-2/tea.jpg`, "menu-images", "chaixpress")
    ).toBeNull();
    expect(
      ownedStoragePath(`${base}/restaurant-assets/restaurants/uuid-2/logo.png`, "restaurant-assets", "uuid-1")
    ).toBeNull();
  });

  it("refuses traversal, folder roots and empty folders", () => {
    expect(
      ownedStoragePath(`${base}/menu-images/restaurants/a/..%2Fb%2Ftea.jpg`, "menu-images", "a")
    ).toBeNull();
    expect(ownedStoragePath(`${base}/menu-images/restaurants/a/`, "menu-images", "a")).toBeNull();
    expect(ownedStoragePath(`${base}/menu-images/restaurants//x.jpg`, "menu-images", "")).toBeNull();
  });
});
