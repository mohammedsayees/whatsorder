import { expect, it } from "vitest";
import { connectorHttpError } from "./connector-error";

it("turns host failures into actionable connection guidance", () => {
  expect(connectorHttpError(404)).toContain("Railway");
  expect(connectorHttpError(404)).toContain("plan is active");
  expect(connectorHttpError(401)).toContain("signing secret");
  expect(connectorHttpError(409)).toContain("reconnect");
  expect(connectorHttpError(503)).toContain("temporarily unavailable");
});
