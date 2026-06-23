import { describe, expect, it } from "vitest";

import { fitWithinMaxEdge, MENU_IMAGE_MAX_EDGE } from "./image-compression";

describe("fitWithinMaxEdge", () => {
  it("scales a large landscape image so the longest edge hits the max", () => {
    expect(fitWithinMaxEdge(3000, 2000, MENU_IMAGE_MAX_EDGE)).toEqual({
      width: 800,
      height: 533
    });
  });

  it("scales a large portrait image by its longest (height) edge", () => {
    expect(fitWithinMaxEdge(2000, 3000, MENU_IMAGE_MAX_EDGE)).toEqual({
      width: 533,
      height: 800
    });
  });

  it("never upscales an image already smaller than the max edge", () => {
    expect(fitWithinMaxEdge(400, 300, MENU_IMAGE_MAX_EDGE)).toEqual({
      width: 400,
      height: 300
    });
  });

  it("leaves an image exactly at the max edge untouched", () => {
    expect(fitWithinMaxEdge(800, 600, MENU_IMAGE_MAX_EDGE)).toEqual({
      width: 800,
      height: 600
    });
  });

  it("clamps degenerate dimensions to at least 1px", () => {
    expect(fitWithinMaxEdge(0, 0, MENU_IMAGE_MAX_EDGE)).toEqual({ width: 1, height: 1 });
  });
});
