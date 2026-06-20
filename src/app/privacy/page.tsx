import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <p className="text-sm font-black uppercase tracking-wide text-leaf">WhatsOrder</p>
      <h1 className="mt-2 text-3xl font-black">Customer privacy notice</h1>
      <p className="mt-4 leading-7 text-stone-600">
        WhatsOrder helps the restaurant receive and manage your order. The restaurant is
        responsible for the customer relationship, while WhatsOrder provides the ordering
        software.
      </p>

      <section className="mt-8 space-y-6 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="font-black">Information used for an order</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Your name, phone number, order items, fulfilment details, address or table/car
            information, consent choices, and order history may be stored so the restaurant can
            prepare, deliver, support, and report on the order.
          </p>
        </div>
        <div>
          <h2 className="font-black">Marketing messages</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Promotional WhatsApp messages are allowed only when you explicitly opt in. You can
            reply STOP to the restaurant at any time. The restaurant can then record your
            withdrawal in WhatsOrder; withdrawing marketing consent does not delete necessary
            order records.
          </p>
        </div>
        <div>
          <h2 className="font-black">Access and requests</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Only authorized restaurant staff and WhatsOrder support administrators should access
            your information for operating and supporting the service. Contact the restaurant
            directly to request correction, export, deletion where applicable, or marketing
            withdrawal.
          </p>
        </div>
      </section>

      <Link
        className="focus-ring mt-6 inline-flex rounded-full bg-ink px-5 py-3 text-sm font-black text-white"
        href="/"
      >
        Back to WhatsOrder
      </Link>
    </main>
  );
}
