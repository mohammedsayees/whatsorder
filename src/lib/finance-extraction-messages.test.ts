import { describe, expect, it } from "vitest";
import { financeReadFailureMessage } from "./finance-extraction-messages";

describe("financeReadFailureMessage", () => {
  it("tells staff the photo is fine when the provider is busy", () => {
    const message = financeReadFailureMessage("provider_busy");
    expect(message.title).toBe("The bill reader is busy");
    expect(message.body).toContain("Your photo is fine");
  });

  it("explains configuration and unclear-read failures", () => {
    expect(financeReadFailureMessage("not_configured").title).toBe("Bill reading is switched off");
    expect(financeReadFailureMessage("invalid_response").title).toBe("Couldn’t read this bill clearly");
    expect(financeReadFailureMessage("download_failed").title).toBe("Couldn’t open the saved photo");
  });

  it("falls back to the generic message for unknown, missing, or stalled reads", () => {
    for (const code of ["extraction_failed", null, undefined, "something_new"]) {
      expect(financeReadFailureMessage(code).title).toBe("Couldn’t read this photo");
    }
  });
});
