import Link from "next/link";
import {
  BarChart3,
  Camera,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  Database,
  ImagePlus,
  LayoutDashboard,
  MapPin,
  MessageSquareText,
  QrCode,
  Repeat2,
  ScanLine,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  WalletCards
} from "lucide-react";

const trustChips = ["Built for UAE restaurants", "No commission", "Works with WhatsApp", "Mobile-first ordering"];

const problems = [
  {
    title: "Orders come as unstructured chats",
    text: "Items, quantities, notes, and payment preferences get mixed across messages.",
    icon: MessageSquareText
  },
  {
    title: "Addresses are searched manually",
    text: "Delivery teams waste time asking for pins, landmarks, and exact building details.",
    icon: MapPin
  },
  {
    title: "Repeat customers are not tracked",
    text: "Restaurants lose useful customer history when every order starts from scratch.",
    icon: Repeat2
  },
  {
    title: "Owners have limited visibility",
    text: "It is hard to see order status, daily revenue, repeat buyers, or top-selling items.",
    icon: BarChart3
  }
];

const flowSteps = [
  { title: "Menu link / QR code", icon: QrCode },
  { title: "Customer selects items", icon: ShoppingBag },
  { title: "Checkout with address or pickup time", icon: ClipboardList },
  { title: "Structured WhatsApp message", icon: Send },
  { title: "Order saved in dashboard", icon: LayoutDashboard }
];

const features = [
  { title: "Digital menu link", text: "Share one restaurant-specific link or QR code.", icon: QrCode },
  { title: "Structured WhatsApp orders", text: "Clean item, address, note, and payment details.", icon: MessageSquareText },
  { title: "Delivery, pickup, scheduled orders", text: "Ready for the ordering modes small restaurants need.", icon: Clock3 },
  { title: "Saved customer details", text: "Make repeat orders faster with saved address data.", icon: Repeat2 },
  { title: "Product image upload", text: "Upload food photos directly from phone or laptop.", icon: ImagePlus },
  { title: "Admin order dashboard", text: "Track New, Preparing, Completed, and more.", icon: LayoutDashboard },
  { title: "Customer database", text: "Understand repeat customers and marketing opt-ins.", icon: Users },
  { title: "Basic sales insights", text: "See revenue, AOV, order counts, and top items.", icon: BarChart3 }
];

const customerSteps = ["Browse menu", "Add items to cart", "Select delivery or pickup", "Share location", "Send order on WhatsApp"];
const restaurantSteps = ["Receive clean order message", "Track orders", "Manage menu", "Save customers", "View repeat customers"];

const values = ["No commission", "Own your customer data", "Faster repeat orders", "Better order clarity", "Easier menu management", "More professional direct ordering experience"];

const faqs = [
  {
    question: "Does WhatsOrder replace WhatsApp?",
    answer: "No. It works with WhatsApp and makes orders structured."
  },
  {
    question: "Do customers need to install an app?",
    answer: "No. Customers open a menu link or scan a QR code."
  },
  {
    question: "Can restaurants manage their own menu?",
    answer: "Yes. Restaurants can add items, edit prices, mark items unavailable, and upload images."
  },
  {
    question: "Can customers reorder faster?",
    answer: "Yes. Customer details can be saved to make repeat ordering easier."
  },
  {
    question: "Is there commission?",
    answer: "No. WhatsOrder is planned as a fixed monthly fee."
  }
];

const whatsappDemoUrl =
  "https://wa.me/971554822424?text=Hi%20WhatsOrder%2C%20I%20would%20like%20to%20request%20a%20demo%20for%20my%20restaurant.";

export default function LandingPage() {
  return (
    <main className="overflow-hidden bg-[#fbfaf7] text-ink">
      <LandingHero />
      <ProblemSection />
      <SolutionFlow />
      <FeatureGrid />
      <CustomerExperience />
      <OwnerValue />
      <PricingTeaser />
      <LandingCTA />
      <FAQSection />
      <LandingFooter />
    </main>
  );
}

function LandingHero() {
  return (
    <section className="relative bg-ink text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(31,138,91,0.34),transparent_32%),radial-gradient(circle_at_78%_12%,rgba(246,182,66,0.18),transparent_30%),linear-gradient(180deg,rgba(23,32,27,0),rgba(23,32,27,0.92))]" />
      <div className="relative mx-auto flex min-h-[94vh] max-w-7xl flex-col px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link className="focus-ring inline-flex items-center gap-3 rounded-full" href="/">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-leaf text-lg font-black text-white shadow-soft">
              W
            </span>
            <span className="text-lg font-black">WhatsOrder</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-bold text-white/72 md:flex">
            <a className="transition hover:text-white" href="#features">Features</a>
            <a className="transition hover:text-white" href="#pricing">Pricing</a>
            <a className="transition hover:text-white" href="#faq">FAQ</a>
            <a className="transition hover:text-white" href="#demo">Contact</a>
          </nav>
          <a
            className="focus-ring hidden rounded-full bg-white px-4 py-2 text-sm font-black text-ink shadow-soft transition hover:-translate-y-0.5 sm:inline-flex"
            href="#demo"
          >
            Request demo
          </a>
        </header>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[0.95fr_1.05fr] lg:py-16">
          <div className="max-w-3xl">
            <p className="inline-flex rounded-full border border-white/14 bg-white/8 px-4 py-2 text-sm font-black text-saffron backdrop-blur">
              Built for small UAE restaurants
            </p>
            <h1 className="mt-6 text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              WhatsApp ordering, made trackable for restaurants.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/76 sm:text-xl">
              WhatsOrder helps small restaurants turn WhatsApp orders into structured orders,
              saved customers, and simple order management without paying commission.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-leaf px-6 py-4 font-black text-white shadow-[0_18px_40px_rgba(31,138,91,0.3)] transition hover:-translate-y-0.5 hover:bg-[#18754d]"
                href="#demo"
              >
                Request a demo
                <ChevronRight size={18} />
              </a>
              <Link
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-white/18 bg-white/8 px-6 py-4 font-black text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/14"
                href="/r/chaixpress"
              >
                View live demo
                <ScanLine size={18} />
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              {trustChips.map((chip) => (
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-2 text-sm font-bold text-white/78" key={chip}>
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <ProductPreview />
        </div>
      </div>
    </section>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-leaf/30 via-white/10 to-saffron/20 blur-2xl" />
      <div className="relative grid gap-4 rounded-[2rem] border border-white/12 bg-white/10 p-3 shadow-[0_30px_90px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:p-4">
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <PhoneMockup />
          <div className="grid gap-4">
            <CheckoutMockup />
            <AdminMockup />
          </div>
        </div>
      </div>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="rounded-[2rem] border border-white/12 bg-[#f9f6ef] p-3 text-ink shadow-soft">
      <div className="overflow-hidden rounded-[1.55rem] bg-white">
        <div className="h-28 bg-[linear-gradient(135deg,#14251e,#1f8a5b)]" />
        <div className="-mt-8 px-4">
          <div className="rounded-2xl bg-white p-4 shadow-soft">
            <p className="text-xs font-black uppercase tracking-wide text-leaf">Chai Xpress</p>
            <h3 className="mt-1 text-xl font-black">Karak, burgers, rolls</h3>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">4.7 rating</span>
              <span className="rounded-full bg-stone-100 px-2 py-1">25-35 min</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 overflow-hidden px-4 py-4 text-sm font-black">
          {["Tea", "Burgers", "Juices"].map((item, index) => (
            <span className={index === 0 ? "text-ink" : "text-stone-400"} key={item}>{item}</span>
          ))}
        </div>
        <div className="space-y-3 px-4 pb-4">
          {[
            ["Karak Tea", "AED 2"],
            ["Zinger Burger", "AED 15"],
            ["Fresh Lime Juice", "AED 8"]
          ].map(([item, price]) => (
            <div className="flex items-center gap-3 rounded-2xl border border-stone-100 p-3" key={item}>
              <div className="h-14 w-14 rounded-xl bg-linen" />
              <div className="min-w-0 flex-1">
                <p className="font-black">{item}</p>
                <p className="text-sm font-bold text-leaf">{price}</p>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-leaf text-white">+</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CheckoutMockup() {
  return (
    <div className="rounded-[1.65rem] border border-white/12 bg-white p-4 text-ink shadow-soft">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-stone-400">Checkout</p>
          <h3 className="text-xl font-black">Structured order</h3>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-mint text-leaf">
          <MapPin size={20} />
        </span>
      </div>
      <div className="mt-4 space-y-2 text-sm">
        {["Name and phone saved", "Location captured", "Cash or card on delivery"].map((line) => (
          <div className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2" key={line}>
            <Check className="text-leaf" size={16} />
            <span className="font-bold text-stone-700">{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminMockup() {
  return (
    <div className="rounded-[1.65rem] border border-white/12 bg-ink p-4 text-white shadow-soft">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-saffron">Admin dashboard</p>
          <h3 className="text-xl font-black">Today at a glance</h3>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10">
          <BarChart3 size={20} />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[
          ["Orders", "18"],
          ["Revenue", "AED 642"],
          ["New", "5"],
          ["Repeat", "7"]
        ].map(([label, value]) => (
          <div className="rounded-xl bg-white/8 p-3" key={label}>
            <p className="text-xs font-bold text-white/50">{label}</p>
            <p className="mt-1 text-lg font-black">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProblemSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <SectionIntro
        eyebrow="The problem"
        title="WhatsApp orders are convenient. Managing them is messy."
        text="WhatsApp is already where customers are. The challenge is turning every chat into a clear, trackable order."
      />
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {problems.map((problem) => {
          const Icon = problem.icon;

          return (
            <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-soft" key={problem.title}>
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-linen text-ink">
                <Icon size={22} />
              </span>
              <h3 className="mt-5 text-lg font-black">{problem.title}</h3>
              <p className="mt-3 leading-7 text-stone-600">{problem.text}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SolutionFlow() {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionIntro
          eyebrow="The solution"
          title="WhatsOrder adds structure without changing customer behavior."
          text="Customers still order through WhatsApp, but restaurants get a cleaner workflow from menu link to dashboard."
        />
        <div className="mt-10 grid gap-3 md:grid-cols-5">
          {flowSteps.map((step, index) => {
            const Icon = step.icon;

            return (
              <div className="relative rounded-2xl border border-stone-200 bg-[#fbfaf7] p-5 shadow-sm" key={step.title}>
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-mint text-leaf">
                  <Icon size={21} />
                </span>
                <p className="mt-5 text-sm font-black uppercase tracking-wide text-stone-400">Step {index + 1}</p>
                <h3 className="mt-2 font-black">{step.title}</h3>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeatureGrid() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8" id="features">
      <SectionIntro
        eyebrow="Features"
        title="Everything small restaurants need to manage direct orders."
        text="A focused toolkit for direct WhatsApp ordering, not a marketplace and not a delivery aggregator."
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => {
          const Icon = feature.icon;

          return (
            <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-leaf/30 hover:shadow-soft" key={feature.title}>
              <Icon className="text-leaf" size={24} />
              <h3 className="mt-5 font-black">{feature.title}</h3>
              <p className="mt-3 text-sm leading-6 text-stone-600">{feature.text}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CustomerExperience() {
  return (
    <section className="bg-ink py-20 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionIntro
          eyebrow="Experience"
          title="Simple for customers. Useful for restaurants."
          text="The same flow feels familiar to customers and operationally useful for restaurant teams."
          dark
        />
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <ChecklistPanel title="Customer side" items={customerSteps} icon={ShoppingBag} />
          <ChecklistPanel title="Restaurant side" items={restaurantSteps} icon={Store} />
        </div>
      </div>
    </section>
  );
}

function OwnerValue() {
  return (
    <section className="mx-auto grid max-w-7xl gap-8 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.22em] text-leaf">Owner value</p>
        <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
          Built for small restaurants that depend on repeat customers.
        </h2>
        <p className="mt-5 text-lg leading-8 text-stone-600">
          WhatsOrder gives restaurants a more professional direct ordering experience while keeping their customer relationship in their own hands.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {values.map((value) => (
          <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" key={value}>
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-mint text-leaf">
              <Check size={16} />
            </span>
            <p className="font-black">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PricingTeaser() {
  return (
    <section className="bg-white py-20" id="pricing">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-stone-200 bg-[linear-gradient(135deg,#fbfaf7,#ffffff)] p-6 shadow-soft sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_330px] lg:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.22em] text-leaf">Launch pricing</p>
              <h2 className="mt-4 text-4xl font-black">Simple pricing for early restaurant partners.</h2>
              <p className="mt-4 leading-7 text-stone-600">
                Limited early pricing for pilot restaurants that want a structured WhatsApp ordering workflow without marketplace commission.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {["Digital menu", "WhatsApp ordering", "Order dashboard", "Customer database", "Menu setup support", "QR code"].map((item) => (
                  <div className="flex items-center gap-2 text-sm font-bold text-stone-700" key={item}>
                    <Check className="text-leaf" size={16} />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl bg-ink p-6 text-white">
              <p className="text-sm font-black text-saffron">Founding Restaurant Offer</p>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-5xl font-black">AED 99</span>
                <span className="pb-2 text-sm font-bold text-white/60">/ month</span>
              </div>
              <p className="mt-3 text-sm font-bold text-white/70">or AED 999 / year with free setup</p>
              <a className="focus-ring mt-6 inline-flex w-full justify-center rounded-full bg-leaf px-5 py-3 font-black text-white transition hover:bg-[#18754d]" href="#demo">
                Request demo
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function LandingCTA() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 lg:px-8" id="demo">
      <p className="text-sm font-black uppercase tracking-[0.22em] text-leaf">Try it with your workflow</p>
      <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
        Want to try WhatsOrder for your restaurant?
      </h2>
      <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-stone-600">
        If you manage orders through WhatsApp, we would love to understand your workflow and show you a demo.
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <a className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-leaf px-6 py-4 font-black text-white shadow-soft transition hover:-translate-y-0.5" href="mailto:hello@whatsorder.ae?subject=WhatsOrder%20demo%20request">
          Request demo
          <ChevronRight size={18} />
        </a>
        <a className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-6 py-4 font-black text-ink shadow-sm transition hover:-translate-y-0.5" href={whatsappDemoUrl}>
          Message us on WhatsApp
          <MessageSquareText size={18} />
        </a>
      </div>
    </section>
  );
}

function FAQSection() {
  return (
    <section className="bg-white py-20" id="faq">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <SectionIntro
          eyebrow="FAQ"
          title="Questions restaurant owners usually ask first."
          text="Straight answers for owners who already receive direct orders through WhatsApp."
        />
        <div className="mt-10 divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-[#fbfaf7]">
          {faqs.map((faq) => (
            <details className="group p-5" key={faq.question}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-black">
                {faq.question}
                <ChevronRight className="shrink-0 transition group-open:rotate-90" size={18} />
              </summary>
              <p className="mt-3 leading-7 text-stone-600">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="bg-ink px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-leaf text-lg font-black">W</span>
            <p className="text-xl font-black">WhatsOrder</p>
          </div>
          <p className="mt-3 text-sm text-white/58">Structured ordering for small restaurants.</p>
          <p className="mt-2 text-sm font-bold text-saffron">@whatsorder.ae</p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-bold text-white/70">
          <Link className="hover:text-white" href="/r/chaixpress">Demo</Link>
          <a className="hover:text-white" href="#features">Features</a>
          <a className="hover:text-white" href="#pricing">Pricing</a>
          <a className="hover:text-white" href="#demo">Contact</a>
        </div>
      </div>
    </footer>
  );
}

function SectionIntro({
  dark = false,
  eyebrow,
  text,
  title
}: {
  dark?: boolean;
  eyebrow: string;
  text: string;
  title: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className={`text-sm font-black uppercase tracking-[0.22em] ${dark ? "text-saffron" : "text-leaf"}`}>
        {eyebrow}
      </p>
      <h2 className={`mt-4 text-4xl font-black tracking-tight sm:text-5xl ${dark ? "text-white" : "text-ink"}`}>
        {title}
      </h2>
      <p className={`mt-5 text-lg leading-8 ${dark ? "text-white/68" : "text-stone-600"}`}>{text}</p>
    </div>
  );
}

function ChecklistPanel({
  icon: Icon,
  items,
  title
}: {
  icon: typeof ShoppingBag;
  items: string[];
  title: string;
}) {
  return (
    <article className="rounded-[2rem] border border-white/10 bg-white/8 p-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-saffron">
          <Icon size={22} />
        </span>
        <h3 className="text-2xl font-black">{title}</h3>
      </div>
      <div className="mt-6 grid gap-3">
        {items.map((item) => (
          <div className="flex items-center gap-3 rounded-2xl bg-white/8 px-4 py-3" key={item}>
            <Check className="text-saffron" size={18} />
            <span className="font-bold text-white/82">{item}</span>
          </div>
        ))}
      </div>
    </article>
  );
}
