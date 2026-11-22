// Staff-facing wording for a bill the reader could not finish, keyed by the
// error_code stored on finance_documents (see safeExtractionError).
export type FinanceReadFailure = { title: string; body: string };

export function financeReadFailureMessage(errorCode: string | null | undefined): FinanceReadFailure {
  switch (errorCode) {
    case "provider_busy":
      return {
        title: "The bill reader is busy",
        body: "Your photo is fine. The reading service didn’t answer – try again in a minute, or type the bill in yourself."
      };
    case "not_configured":
      return {
        title: "Bill reading is switched off",
        body: "Automatic reading isn’t set up for this restaurant yet. Type the bill in yourself."
      };
    case "invalid_response":
      return {
        title: "Couldn’t read this bill clearly",
        body: "The reader wasn’t sure what it saw. Try again, or type the bill in yourself."
      };
    case "download_failed":
      return {
        title: "Couldn’t open the saved photo",
        body: "Try again in a moment, or type the bill in yourself."
      };
    default:
      return {
        title: "Couldn’t read this photo",
        body: "Try again, or type the bill in yourself."
      };
  }
}
