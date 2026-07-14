import type {
  Customer,
  FulfilmentType,
  Order,
  PaymentMethod
} from "@/lib/types";

const uaeOffset = "+04:00";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_REPORT_RANGE_DAYS = 366;

export type ReportPreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "this_month"
  | "previous_month"
  | "custom";

export type ReportTab =
  | "overview"
  | "sales"
  | "payments"
  | "products"
  | "customers"
  | "fulfilment";

export type ReportRange = {
  endDate: string;
  endExclusiveIso: string;
  label: string;
  preset: ReportPreset;
  startDate: string;
  startIso: string;
};

export type SalesReportRow = {
  averageOrderValue: number;
  date: string;
  deliveryFees: number;
  discounts: number;
  orders: number;
  sales: number;
};

export type ProductReportRow = {
  averageSellingPrice: number;
  itemId: string;
  lastSoldAt: string;
  name: string;
  orderCount: number;
  quantity: number;
  rank: number;
  sales: number;
  salesShare: number;
};

export type PaymentReportRow = {
  amount: number;
  method: PaymentMethod;
  orderCount: number;
  salesShare: number;
};

export type FulfilmentReportRow = {
  averageOrderValue: number;
  amount: number;
  fulfilment: FulfilmentType;
  orderCount: number;
  salesShare: number;
};

export type CustomerReportRow = {
  completedOrders: number;
  marketingConsent: boolean;
  name: string;
  phone: string;
  spend: number;
};

export type RestaurantReport = {
  averageOrderValue: number;
  cancelledOrders: number;
  completedOrders: number;
  customerRows: CustomerReportRow[];
  deliveryFees: number;
  discounts: number;
  fulfilmentRows: FulfilmentReportRow[];
  marketingConsentCustomers: number;
  newCustomers: number;
  paymentRows: PaymentReportRow[];
  productRows: ProductReportRow[];
  repeatCustomers: number;
  sales: number;
  salesRows: SalesReportRow[];
  uniqueCustomers: number;
};

function dateInUae(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Dubai",
    year: "numeric"
  }).format(value);
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00${uaeOffset}`);
}

function shiftDate(value: string, days: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateInUae(date);
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function previousMonthStart(value: string) {
  const date = parseDate(monthStart(value));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return dateInUae(date);
}

function validDate(value?: string) {
  if (!value || !datePattern.test(value)) {
    return null;
  }

  const parsed = parseDate(value);
  return Number.isNaN(parsed.getTime()) || dateInUae(parsed) !== value ? null : value;
}

function formatRangeLabel(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat("en-AE", {
    dateStyle: "medium",
    timeZone: "Asia/Dubai"
  });

  if (startDate === endDate) {
    return formatter.format(parseDate(startDate));
  }

  return `${formatter.format(parseDate(startDate))} – ${formatter.format(parseDate(endDate))}`;
}

export function resolveReportRange(
  presetValue?: string,
  customStart?: string,
  customEnd?: string,
  now: Date = new Date()
): ReportRange {
  const allowedPresets: ReportPreset[] = [
    "today",
    "yesterday",
    "last_7_days",
    "this_month",
    "previous_month",
    "custom"
  ];
  const preset = allowedPresets.includes(presetValue as ReportPreset)
    ? (presetValue as ReportPreset)
    : "today";
  const today = dateInUae(now);
  let startDate = today;
  let endDate = today;

  if (preset === "yesterday") {
    startDate = shiftDate(today, -1);
    endDate = startDate;
  } else if (preset === "last_7_days") {
    startDate = shiftDate(today, -6);
  } else if (preset === "this_month") {
    startDate = monthStart(today);
  } else if (preset === "previous_month") {
    startDate = previousMonthStart(today);
    endDate = shiftDate(monthStart(today), -1);
  } else if (preset === "custom") {
    const requestedStart = validDate(customStart);
    const requestedEnd = validDate(customEnd);

    if (requestedStart && requestedEnd && requestedStart <= requestedEnd) {
      const earliestAllowedStart = shiftDate(
        requestedEnd,
        -(MAX_REPORT_RANGE_DAYS - 1)
      );
      startDate = requestedStart < earliestAllowedStart
        ? earliestAllowedStart
        : requestedStart;
      endDate = requestedEnd;
    } else {
      startDate = monthStart(today);
    }
  }

  return {
    endDate,
    endExclusiveIso: `${shiftDate(endDate, 1)}T00:00:00${uaeOffset}`,
    label: formatRangeLabel(startDate, endDate),
    preset,
    startDate,
    startIso: `${startDate}T00:00:00${uaeOffset}`
  };
}

function fulfilmentLabel(value: FulfilmentType) {
  const labels: Record<FulfilmentType, string> = {
    car_pickup: "Bring to My Car",
    delivery: "Delivery",
    dine_in: "Dine-in",
    takeaway: "Takeaway"
  };

  return labels[value];
}

export function getFulfilmentReportLabel(value: FulfilmentType) {
  return fulfilmentLabel(value);
}

export function buildRestaurantReport(
  orders: Order[],
  customers: Customer[] = []
): RestaurantReport {
  const completed = orders.filter((order) => order.status === "Completed");
  const cancelledOrders = orders.filter((order) => order.status === "Cancelled").length;
  const sales = completed.reduce((sum, order) => sum + Number(order.total), 0);
  const deliveryFees = completed.reduce(
    (sum, order) => sum + Number(order.delivery_fee),
    0
  );
  const discounts = completed.reduce(
    (sum, order) => sum + Number(order.loyalty_discount),
    0
  );
  const salesByDate = new Map<string, SalesReportRow>();
  const products = new Map<
    string,
    Omit<ProductReportRow, "averageSellingPrice" | "rank" | "salesShare">
  >();
  const payments = new Map<PaymentMethod, { amount: number; orderCount: number }>();
  const fulfilments = new Map<
    FulfilmentType,
    { amount: number; orderCount: number }
  >();
  const customerMap = new Map<
    string,
    Omit<CustomerReportRow, "marketingConsent">
  >();

  for (const order of completed) {
    const date = dateInUae(new Date(order.created_at));
    const daily = salesByDate.get(date) ?? {
      averageOrderValue: 0,
      date,
      deliveryFees: 0,
      discounts: 0,
      orders: 0,
      sales: 0
    };
    daily.orders += 1;
    daily.sales += Number(order.total);
    daily.deliveryFees += Number(order.delivery_fee);
    daily.discounts += Number(order.loyalty_discount);
    daily.averageOrderValue = daily.sales / daily.orders;
    salesByDate.set(date, daily);

    if (order.payment_method) {
      const payment = payments.get(order.payment_method) ?? {
        amount: 0,
        orderCount: 0
      };
      payment.amount += Number(order.total);
      payment.orderCount += 1;
      payments.set(order.payment_method, payment);
    }

    const fulfilment = fulfilments.get(order.fulfilment_type) ?? {
      amount: 0,
      orderCount: 0
    };
    fulfilment.amount += Number(order.total);
    fulfilment.orderCount += 1;
    fulfilments.set(order.fulfilment_type, fulfilment);

    const customer = customerMap.get(order.customer_phone) ?? {
      completedOrders: 0,
      name: order.customer_name,
      phone: order.customer_phone,
      spend: 0
    };
    customer.completedOrders += 1;
    customer.spend += Number(order.total);
    customerMap.set(order.customer_phone, customer);

    const productsSeen = new Set<string>();
    for (const item of order.items) {
      const itemId = item.item_id || item.name;
      const product = products.get(itemId) ?? {
        itemId,
        lastSoldAt: order.created_at,
        name: item.name,
        orderCount: 0,
        quantity: 0,
        sales: 0
      };
      product.quantity += Number(item.quantity);
      product.sales += Number(item.price) * Number(item.quantity);

      if (!productsSeen.has(itemId)) {
        product.orderCount += 1;
        productsSeen.add(itemId);
      }

      if (order.created_at > product.lastSoldAt) {
        product.lastSoldAt = order.created_at;
        product.name = item.name;
      }
      products.set(itemId, product);
    }
  }

  const consentByPhone = new Map(
    customers.map((customer) => [
      customer.phone,
      customer.marketing_opt_in && customer.consent_marketing
    ])
  );
  const customerRows = [...customerMap.values()]
    .map((customer) => ({
      ...customer,
      marketingConsent: consentByPhone.get(customer.phone) === true
    }))
    .toSorted(
      (first, second) =>
        second.spend - first.spend ||
        second.completedOrders - first.completedOrders ||
        first.name.localeCompare(second.name)
    );
  const productSales = [...products.values()].reduce(
    (sum, product) => sum + product.sales,
    0
  );

  return {
    averageOrderValue: completed.length > 0 ? sales / completed.length : 0,
    cancelledOrders,
    completedOrders: completed.length,
    customerRows,
    deliveryFees,
    discounts,
    fulfilmentRows: [...fulfilments.entries()]
      .map(([fulfilment, values]) => ({
        amount: values.amount,
        averageOrderValue: values.amount / values.orderCount,
        fulfilment,
        orderCount: values.orderCount,
        salesShare: sales > 0 ? (values.amount / sales) * 100 : 0
      }))
      .toSorted((first, second) => second.amount - first.amount),
    marketingConsentCustomers: customerRows.filter(
      (customer) => customer.marketingConsent
    ).length,
    newCustomers: customerRows.filter((customer) => customer.completedOrders === 1).length,
    paymentRows: [...payments.entries()]
      .map(([method, values]) => ({
        amount: values.amount,
        method,
        orderCount: values.orderCount,
        salesShare: sales > 0 ? (values.amount / sales) * 100 : 0
      }))
      .toSorted((first, second) => second.amount - first.amount),
    productRows: [...products.values()]
      .toSorted(
        (first, second) =>
          second.quantity - first.quantity ||
          second.sales - first.sales ||
          first.name.localeCompare(second.name)
      )
      .map((product, index) => ({
        ...product,
        averageSellingPrice:
          product.quantity > 0 ? product.sales / product.quantity : 0,
        rank: index + 1,
        salesShare: productSales > 0 ? (product.sales / productSales) * 100 : 0
      })),
    repeatCustomers: customerRows.filter(
      (customer) => customer.completedOrders >= 2
    ).length,
    sales,
    salesRows: [...salesByDate.values()].toSorted((first, second) =>
      first.date.localeCompare(second.date)
    ),
    uniqueCustomers: customerRows.length
  };
}

export function csvCell(value: string | number | boolean) {
  const rawValue = String(value);
  const stringValue =
    typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(rawValue)
      ? `'${rawValue}`
      : rawValue;
  return /[",\n]/.test(stringValue)
    ? `"${stringValue.replaceAll('"', '""')}"`
    : stringValue;
}

export function reportToCsv(tab: ReportTab, report: RestaurantReport) {
  const rows: Array<Array<string | number | boolean>> = [];

  if (tab === "sales" || tab === "overview") {
    rows.push(["Date", "Completed orders", "Sales", "Average order", "Delivery fees", "Discounts"]);
    report.salesRows.forEach((row) =>
      rows.push([
        row.date,
        row.orders,
        row.sales.toFixed(2),
        row.averageOrderValue.toFixed(2),
        row.deliveryFees.toFixed(2),
        row.discounts.toFixed(2)
      ])
    );
  } else if (tab === "payments") {
    rows.push(["Payment method", "Completed orders", "Amount", "Sales share %"]);
    report.paymentRows.forEach((row) =>
      rows.push([
        row.method,
        row.orderCount,
        row.amount.toFixed(2),
        row.salesShare.toFixed(2)
      ])
    );
  } else if (tab === "products") {
    rows.push(["Rank", "Product", "Quantity", "Orders", "Sales", "Average selling price", "Sales share %", "Last sold"]);
    report.productRows.forEach((row) =>
      rows.push([
        row.rank,
        row.name,
        row.quantity,
        row.orderCount,
        row.sales.toFixed(2),
        row.averageSellingPrice.toFixed(2),
        row.salesShare.toFixed(2),
        row.lastSoldAt
      ])
    );
  } else if (tab === "customers") {
    rows.push(["Customer", "Phone", "Completed orders", "Spend", "Marketing consent"]);
    report.customerRows.forEach((row) =>
      rows.push([
        row.name,
        row.phone,
        row.completedOrders,
        row.spend.toFixed(2),
        row.marketingConsent ? "Yes" : "No"
      ])
    );
  } else {
    rows.push(["Fulfilment", "Completed orders", "Sales", "Average order", "Sales share %"]);
    report.fulfilmentRows.forEach((row) =>
      rows.push([
        fulfilmentLabel(row.fulfilment),
        row.orderCount,
        row.amount.toFixed(2),
        row.averageOrderValue.toFixed(2),
        row.salesShare.toFixed(2)
      ])
    );
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
