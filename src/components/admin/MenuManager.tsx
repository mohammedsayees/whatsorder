"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCategoryAction,
  addMenuItemAction,
  deleteMenuItemAction,
  importMenuRowsAction,
  moveCategoryAction,
  removeMenuItemImageAction,
  toggleMenuItemAvailabilityAction,
  updateMenuItemAction,
  uploadMenuItemImageAction
} from "@/app/actions";
import {
  generateItemDescriptionAction,
  translateItemAction
} from "@/app/admin/menu/import/actions";
import { AiImageGenerator } from "@/components/admin/AiImageGenerator";
import { formatAED } from "@/lib/currency";
import { compressMenuImage } from "@/lib/image-compression";
import type { MenuCategory, MenuItem, MenuOptionCatalog } from "@/lib/types";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  FileSpreadsheet,
  ImageIcon,
  Plus,
  Search,
  Sparkles,
  Tags,
  X
} from "lucide-react";

type ImportRow = {
  id: string;
  category: string;
  item_name: string;
  description: string;
  price: string;
  is_available: boolean;
  is_featured: boolean;
  errors: string[];
};

type TemplateName =
  | "Cafeteria"
  | "Shawarma shop"
  | "Burger shop"
  | "Juice shop"
  | "Kerala restaurant"
  | "Cloud kitchen";

const csvTemplate = `category,item_name,description,price,is_available,is_best_seller
Tea & Hot Drinks,Karak Tea,Signature hot karak tea,2,true,true
Burgers,Zinger Burger,Crispy chicken burger,12,true,true
Juices,Fresh Lime Juice,Chilled fresh lime juice,8,true,false
`;
const BEST_SELLERS_FILTER = "best-sellers";
const MISSING_IMAGES_FILTER = "missing-images";

const sampleTemplates: Record<TemplateName, Omit<ImportRow, "id" | "errors">[]> = {
  Cafeteria: [
    { category: "Tea & Hot Drinks", item_name: "Karak Tea", description: "Classic cafeteria karak", price: "2", is_available: true, is_featured: true },
    { category: "Rolls", item_name: "Oman Chips Porotta", description: "Porotta with Oman Chips and cheese", price: "5", is_available: true, is_featured: false },
    { category: "Snacks", item_name: "Loaded Fries", description: "Fries with chicken, cheese, and sauce", price: "12", is_available: true, is_featured: true }
  ],
  "Shawarma shop": [
    { category: "Shawarma", item_name: "Chicken Shawarma", description: "Classic chicken shawarma wrap", price: "6", is_available: true, is_featured: true },
    { category: "Shawarma", item_name: "Spicy Shawarma", description: "Chicken shawarma with spicy sauce", price: "7", is_available: true, is_featured: false },
    { category: "Combos", item_name: "Shawarma Combo", description: "Shawarma, fries, and drink", price: "15", is_available: true, is_featured: true }
  ],
  "Burger shop": [
    { category: "Burgers", item_name: "Zinger Burger", description: "Crispy chicken burger", price: "15", is_available: true, is_featured: true },
    { category: "Burgers", item_name: "Double Smash Burger", description: "Double beef patty with cheese", price: "21", is_available: true, is_featured: true },
    { category: "Sides", item_name: "Chicken Loaded Fries", description: "Loaded fries with chicken", price: "16", is_available: true, is_featured: false }
  ],
  "Juice shop": [
    { category: "Fresh Juices", item_name: "Fresh Lime Juice", description: "Chilled fresh lime juice", price: "8", is_available: true, is_featured: true },
    { category: "Fresh Juices", item_name: "Avocado Juice", description: "Creamy avocado juice", price: "12", is_available: true, is_featured: true },
    { category: "Smoothies", item_name: "Mango Smoothie", description: "Mango smoothie with milk", price: "14", is_available: true, is_featured: false }
  ],
  "Kerala restaurant": [
    { category: "Breakfast", item_name: "Appam & Stew", description: "Kerala appam with chicken stew", price: "16", is_available: true, is_featured: true },
    { category: "Meals", item_name: "Kerala Fish Curry Meals", description: "Rice meals with fish curry", price: "22", is_available: true, is_featured: true },
    { category: "Snacks", item_name: "Beef Cutlet", description: "Kerala-style beef cutlet", price: "4", is_available: true, is_featured: false }
  ],
  "Cloud kitchen": [
    { category: "Bowls", item_name: "Chicken Rice Bowl", description: "Chicken, rice, salad, and sauce", price: "24", is_available: true, is_featured: true },
    { category: "Wraps", item_name: "Peri Peri Chicken Wrap", description: "Spicy chicken wrap", price: "18", is_available: true, is_featured: true },
    { category: "Combos", item_name: "Solo Meal Box", description: "Main, side, and drink", price: "32", is_available: true, is_featured: false }
  ]
};

function categoryName(categories: MenuCategory[], categoryId: string) {
  return categories.find((category) => category.id === categoryId)?.name ?? "Uncategorized";
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"" && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current.trim());
      current = "";
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
}

function toImportRows(rows: Omit<ImportRow, "id" | "errors">[]) {
  return rows.map((row, index) => validateImportRow({ ...row, id: `${Date.now()}-${index}`, errors: [] }));
}

function validateImportRow(row: ImportRow): ImportRow {
  const errors: string[] = [];

  if (!row.category.trim()) {
    errors.push("Missing category");
  }
  if (!row.item_name.trim()) {
    errors.push("Missing item name");
  }
  if (!row.price.trim() || Number.isNaN(Number(row.price)) || Number(row.price) < 0) {
    errors.push("Missing or invalid price");
  }

  return { ...row, errors };
}

function rowPayload(row: ImportRow) {
  return {
    category: row.category.trim(),
    item_name: row.item_name.trim(),
    description: row.description.trim(),
    price: Number(row.price),
    is_available: row.is_available,
    is_featured: row.is_featured
  };
}

export function MenuManager({
  categories,
  items,
  canWrite,
  optionCatalog,
  restaurantId,
  restaurantSlug
}: {
  categories: MenuCategory[];
  items: MenuItem[];
  canWrite: boolean;
  optionCatalog?: MenuOptionCatalog;
  restaurantId?: string;
  restaurantSlug: string;
}) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateName>("Cafeteria");
  const [isPending, startTransition] = useTransition();
  const sortedCategories = useMemo(
    () => [...categories].sort((first, second) => first.display_order - second.display_order),
    [categories]
  );
  const uploadedImageCount = items.filter((item) => item.image_url).length;
  const missingImageCount = items.length - uploadedImageCount;

  const visibleItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesCategory =
        activeCategory === "all" ||
        (activeCategory === BEST_SELLERS_FILTER
          ? item.is_featured
          : activeCategory === MISSING_IMAGES_FILTER
            ? !item.image_url
            : item.category_id === activeCategory);
      const matchesSearch = !normalizedSearch || item.name.toLowerCase().includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, items, search]);

  const summary = useMemo(
    () => [
      { label: "Total categories", value: categories.length },
      { label: "Total items", value: items.length },
      { label: "Available items", value: items.filter((item) => item.is_available).length },
      { label: "Best Sellers", value: items.filter((item) => item.is_featured).length },
      { label: "Images uploaded", value: `${uploadedImageCount}/${items.length}` },
      { label: "Missing images", value: missingImageCount }
    ],
    [categories.length, items, missingImageCount, uploadedImageCount]
  );

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([csvTemplate], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "whatsorder-menu-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleCsvUpload(file: File | null) {
    setImportMessage(null);

    if (!file) {
      return;
    }

    const text = await file.text();
    const [headers = [], ...dataRows] = parseCsv(text);
    const normalizedHeaders = headers.map((header) => header.trim().toLowerCase());

    const rows = dataRows.map((cells, index) => {
      const value = (key: string) => cells[normalizedHeaders.indexOf(key)] ?? "";

      return validateImportRow({
        id: `${file.name}-${index}`,
        category: value("category"),
        item_name: value("item_name"),
        description: value("description"),
        price: value("price"),
        is_available: value("is_available").toLowerCase() !== "false",
        is_featured: ["true", "yes", "1"].includes(
          (value("is_best_seller") || value("is_featured")).toLowerCase()
        ),
        errors: []
      });
    });

    setImportRows(rows);
    setImportOpen(true);
  }

  function loadTemplate(name: TemplateName) {
    setSelectedTemplate(name);
    setImportMessage(null);
    setImportRows(toImportRows(sampleTemplates[name]));
    setTemplateOpen(true);
  }

  function updateImportRow(rowId: string, changes: Partial<ImportRow>) {
    setImportRows((current) =>
      current.map((row) => (row.id === rowId ? validateImportRow({ ...row, ...changes }) : row))
    );
  }

  function saveImportRows() {
    const validRows = importRows.map(validateImportRow);
    const hasErrors = validRows.some((row) => row.errors.length > 0);
    setImportRows(validRows);

    if (hasErrors) {
      setImportMessage("Fix the highlighted rows before importing.");
      return;
    }

    const formData = new FormData();
    formData.set("rows", JSON.stringify(validRows.map(rowPayload)));
    if (restaurantId) {
      formData.set("restaurant_id", restaurantId);
    }

    startTransition(async () => {
      const result = await importMenuRowsAction(formData);
      setImportMessage(result.message);

      if (result.ok) {
        setImportRows([]);
        setImportOpen(false);
        setTemplateOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {summary.map((card) => (
          <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm" key={card.label}>
            <p className="text-sm font-bold text-stone-500">{card.label}</p>
            <p className="mt-2 text-2xl font-black">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-black">Menu onboarding</h2>
            <p className="mt-1 text-sm text-stone-500">Start with a template, import CSV, or add items manually.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:flex">
            <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-2 text-sm font-black text-white disabled:opacity-50" disabled={!canWrite} onClick={() => setAddItemOpen(true)} type="button">
              <Plus size={16} />
              Add item
            </button>
            <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 px-4 py-2 text-sm font-black disabled:opacity-50" disabled={!canWrite} onClick={() => setAddCategoryOpen(true)} type="button">
              <Tags size={16} />
              Add category
            </button>
            <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 px-4 py-2 text-sm font-black disabled:opacity-50" disabled={!canWrite} onClick={() => setImportOpen(true)} type="button">
              <FileSpreadsheet size={16} />
              Import CSV
            </button>
            <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 px-4 py-2 text-sm font-black disabled:opacity-50" disabled={!canWrite} onClick={() => loadTemplate(selectedTemplate)} type="button">
              <Sparkles size={16} />
              Use template
            </button>
            <a className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-black text-white" href={`/r/${restaurantSlug}`} rel="noreferrer" target="_blank">
              <Eye size={16} />
              Preview menu
            </a>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <button className="rounded-lg border border-dashed border-stone-300 px-3 py-3 text-left text-sm font-bold disabled:opacity-50" disabled={!canWrite} onClick={() => setImportOpen(true)} type="button">Import CSV</button>
          <button className="rounded-lg border border-dashed border-stone-300 px-3 py-3 text-left text-sm font-bold disabled:opacity-50" disabled={!canWrite} onClick={() => loadTemplate(selectedTemplate)} type="button">Use sample template</button>
          <button className="rounded-lg border border-dashed border-stone-300 px-3 py-3 text-left text-sm font-bold disabled:opacity-50" disabled={!canWrite} onClick={() => setAddItemOpen(true)} type="button">Add manually</button>
          <button className="rounded-lg border border-dashed border-stone-300 px-3 py-3 text-left text-sm font-bold text-stone-400" disabled type="button">
            <ImageIcon className="mb-2" size={18} />
            Upload menu photo/PDF coming soon
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-black">Category order</h2>
            <p className="mt-1 text-sm text-stone-500">
              Move best-selling categories to the top of the customer menu.
            </p>
          </div>
          <p className="text-xs font-bold uppercase tracking-wide text-stone-400">
            Customer menu order
          </p>
        </div>

        {sortedCategories.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-stone-300 p-5 text-sm font-semibold text-stone-500">
            Add a category to start arranging your menu.
          </div>
        ) : (
          <div className="mt-4 divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200">
            {sortedCategories.map((category, index) => (
              <div
                className="grid gap-3 px-4 py-3 sm:grid-cols-[40px_1fr_auto] sm:items-center"
                key={category.id}
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-sm font-black text-stone-600">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-black text-ink">{category.name}</p>
                  {category.name_ar ? (
                    <p className="mt-1 text-sm font-semibold text-stone-500" dir="rtl">
                      {category.name_ar}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <form action={moveCategoryAction}>
                    {restaurantId ? <input name="restaurant_id" type="hidden" value={restaurantId} /> : null}
                    <input name="category_id" type="hidden" value={category.id} />
                    <input name="direction" type="hidden" value="up" />
                    <button
                      aria-label={`Move ${category.name} up`}
                      className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 text-stone-700 disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={!canWrite || index === 0}
                      type="submit"
                    >
                      <ArrowUp size={17} />
                    </button>
                  </form>
                  <form action={moveCategoryAction}>
                    {restaurantId ? <input name="restaurant_id" type="hidden" value={restaurantId} /> : null}
                    <input name="category_id" type="hidden" value={category.id} />
                    <input name="direction" type="hidden" value="down" />
                    <button
                      aria-label={`Move ${category.name} down`}
                      className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 text-stone-700 disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={!canWrite || index === sortedCategories.length - 1}
                      type="submit"
                    >
                      <ArrowDown size={17} />
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={17} />
            <input
              className="focus-ring w-full rounded-lg border border-stone-200 py-2 pl-9 pr-3 lg:w-80"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search item name"
              value={search}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button className={`shrink-0 rounded-full px-3 py-2 text-sm font-black ${activeCategory === "all" ? "bg-ink text-white" : "bg-stone-100 text-stone-700"}`} onClick={() => setActiveCategory("all")} type="button">
              All
            </button>
            <button
              className={`shrink-0 rounded-full px-3 py-2 text-sm font-black ${
                activeCategory === BEST_SELLERS_FILTER
                  ? "bg-amber-500 text-white"
                  : "bg-amber-50 text-amber-800"
              }`}
              onClick={() => setActiveCategory(BEST_SELLERS_FILTER)}
              type="button"
            >
              Best Sellers
            </button>
            <button
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-black ${
                activeCategory === MISSING_IMAGES_FILTER
                  ? "bg-amber-500 text-white"
                  : "bg-amber-50 text-amber-800"
              }`}
              onClick={() => setActiveCategory(MISSING_IMAGES_FILTER)}
              type="button"
            >
              <ImageIcon size={15} />
              Images Missing
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  activeCategory === MISSING_IMAGES_FILTER
                    ? "bg-white/20"
                    : "bg-white"
                }`}
              >
                {missingImageCount}
              </span>
            </button>
            {sortedCategories.map((category) => (
              <button
                className={`shrink-0 rounded-full px-3 py-2 text-sm font-black ${activeCategory === category.id ? "bg-ink text-white" : "bg-stone-100 text-stone-700"}`}
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                type="button"
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        {visibleItems.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-stone-300 p-8 text-center">
            <h3 className="text-lg font-black">No menu items found</h3>
            <p className="mt-2 text-sm text-stone-500">
              {activeCategory === MISSING_IMAGES_FILTER
                ? "Every product in this view has an image."
                : "Add an item manually, import a CSV, or start with a sample template."}
            </p>
            {activeCategory !== MISSING_IMAGES_FILTER ? (
              <button className="focus-ring mt-4 rounded-full bg-leaf px-4 py-2 text-sm font-black text-white disabled:opacity-50" disabled={!canWrite} onClick={() => setAddItemOpen(true)} type="button">
                Add first item
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-lg border border-stone-200">
            <div className="hidden grid-cols-[1.4fr_1fr_120px_120px_120px_170px] gap-3 bg-stone-50 px-4 py-3 text-sm font-black text-stone-600 lg:grid">
              <span>Item</span>
              <span>Category</span>
              <span>Price</span>
              <span>Available</span>
              <span>Best Seller</span>
              <span>Actions</span>
            </div>
            <div className="divide-y divide-stone-200">
              {visibleItems.map((item) => (
                <div
                  className={`grid gap-3 px-4 py-4 lg:grid-cols-[1.4fr_1fr_120px_120px_120px_170px] lg:items-center ${
                    item.image_url ? "" : "bg-amber-50/35"
                  }`}
                  key={item.id}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      aria-label={`Edit image for ${item.name}`}
                      className={`focus-ring relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border ${
                        item.image_url
                          ? "border-stone-200 bg-linen"
                          : "border-dashed border-amber-300 bg-amber-50 text-amber-700"
                      }`}
                      disabled={!canWrite}
                      onClick={() => setEditingItem(item)}
                      type="button"
                    >
                      {item.image_url ? (
                        // Device-uploaded Supabase Storage URLs are shown without remote image config.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          src={item.image_url}
                        />
                      ) : (
                        <span className="flex flex-col items-center gap-1 text-[10px] font-black">
                          <ImageIcon size={20} />
                          No image
                        </span>
                      )}
                    </button>
                    <div className="min-w-0">
                      <p className="font-black">{item.name}</p>
                      {item.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-stone-500">
                          {item.description}
                        </p>
                      ) : null}
                      {!item.image_url ? (
                        <p className="mt-1 text-xs font-black text-amber-700">
                          Product image missing
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-sm font-bold text-stone-600">{categoryName(categories, item.category_id)}</p>
                  <p className="font-black text-leaf">{formatAED(item.price)}</p>
                  <form action={toggleMenuItemAvailabilityAction}>
                    {restaurantId ? <input name="restaurant_id" type="hidden" value={restaurantId} /> : null}
                    <input name="item_id" type="hidden" value={item.id} />
                    <input name="is_available" type="hidden" value={String(!item.is_available)} />
                    <button className={`focus-ring rounded-full px-3 py-1.5 text-xs font-black disabled:opacity-50 ${item.is_available ? "bg-mint/20 text-leaf" : "bg-stone-100 text-stone-500"}`} disabled={!canWrite} type="submit">
                      {item.is_available ? "Available" : "Unavailable"}
                    </button>
                  </form>
                  <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-black ${item.is_featured ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-500"}`}>
                    {item.is_featured ? "Best Seller" : "Standard"}
                  </span>
                  <div className="flex gap-2">
                    <button className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm font-black disabled:opacity-50" disabled={!canWrite} onClick={() => setEditingItem(item)} type="button">
                      Edit
                    </button>
                    <form action={deleteMenuItemAction}>
                      {restaurantId ? <input name="restaurant_id" type="hidden" value={restaurantId} /> : null}
                      <input name="item_id" type="hidden" value={item.id} />
                      <button className="focus-ring rounded-lg px-3 py-2 text-sm font-black text-red-600 disabled:opacity-50" disabled={!canWrite} type="submit">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {addItemOpen ? (
        <Dialog title="Add menu item" onClose={() => setAddItemOpen(false)}>
          <ItemForm categories={categories} canWrite={canWrite} onDone={() => { setAddItemOpen(false); router.refresh(); }} optionCatalog={optionCatalog} restaurantId={restaurantId} />
        </Dialog>
      ) : null}

      {addCategoryOpen ? (
        <Dialog
          title="Add category"
          onClose={() => {
            setAddCategoryOpen(false);
            setCategoryError(null);
          }}
        >
          <form
            action={async (formData) => {
              setCategoryError(null);

              try {
                await addCategoryAction(formData);
                setAddCategoryOpen(false);
                router.refresh();
              } catch (error) {
                setCategoryError(
                  error instanceof Error ? error.message : "Category could not be added."
                );
              }
            }}
            className="space-y-3"
          >
            {restaurantId ? <input name="restaurant_id" type="hidden" value={restaurantId} /> : null}
            <input className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2" disabled={!canWrite} name="name" placeholder="Breakfast" required />
            <input
              className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2 text-right"
              dir="rtl"
              disabled={!canWrite}
              name="name_ar"
              placeholder="اسم القسم بالعربية"
            />
            <p className="text-sm text-stone-500">
              Best Sellers is generated automatically. Tag products as Best Seller instead of
              creating it as a category.
            </p>
            {categoryError ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {categoryError}
              </p>
            ) : null}
            <button className="focus-ring w-full rounded-lg bg-ink px-4 py-2 font-bold text-white disabled:opacity-50" disabled={!canWrite} type="submit">
              Add category
            </button>
          </form>
        </Dialog>
      ) : null}

      {editingItem ? (
        <Dialog title={`Edit ${editingItem.name}`} onClose={() => setEditingItem(null)}>
          <ItemForm categories={categories} canWrite={canWrite} item={editingItem} onDone={() => { setEditingItem(null); router.refresh(); }} optionCatalog={optionCatalog} restaurantId={restaurantId} />
        </Dialog>
      ) : null}

      {importOpen ? (
        <Dialog title="Import CSV" onClose={() => setImportOpen(false)}>
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 px-4 py-2 text-sm font-black" onClick={downloadTemplate} type="button">
                <Download size={16} />
                Download CSV template
              </button>
              <label className="focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-black text-white">
                Upload CSV
                <input accept=".csv,text/csv" className="sr-only" onChange={(event) => { void handleCsvUpload(event.target.files?.[0] ?? null); }} type="file" />
              </label>
            </div>
            <ImportPreview
              importMessage={importMessage}
              isPending={isPending}
              rows={importRows}
              saveRows={saveImportRows}
              updateRow={updateImportRow}
            />
          </div>
        </Dialog>
      ) : null}

      {templateOpen ? (
        <Dialog title="Use sample template" onClose={() => setTemplateOpen(false)}>
          <div className="space-y-4">
            <select className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2" onChange={(event) => loadTemplate(event.target.value as TemplateName)} value={selectedTemplate}>
              {Object.keys(sampleTemplates).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <ImportPreview
              importMessage={importMessage}
              isPending={isPending}
              rows={importRows}
              saveRows={saveImportRows}
              updateRow={updateImportRow}
            />
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function Dialog({
  children,
  onClose,
  title
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-0 sm:items-center sm:justify-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:max-w-2xl sm:rounded-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-black">{title}</h2>
          <button className="focus-ring rounded-full p-2 text-stone-500" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ItemForm({
  canWrite,
  categories,
  item,
  onDone,
  optionCatalog,
  restaurantId
}: {
  canWrite: boolean;
  categories: MenuCategory[];
  item?: MenuItem;
  onDone: () => void;
  optionCatalog?: MenuOptionCatalog;
  restaurantId?: string;
}) {
  const action = item ? updateMenuItemAction : addMenuItemAction;
  const router = useRouter();
  const sortedCategories = useMemo(
    () => [...categories].sort((first, second) => first.display_order - second.display_order),
    [categories]
  );
  const sortedOptionGroups = useMemo(
    () =>
      [...(optionCatalog?.groups ?? [])].sort(
        (first, second) => first.display_order - second.display_order
      ),
    [optionCatalog]
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(() =>
    item && optionCatalog
      ? optionCatalog.links
          .filter((link) => link.menu_item_id === item.id)
          .sort((first, second) => first.display_order - second.display_order)
          .map((link) => link.group_id)
      : []
  );

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    );
  };
  const [itemName, setItemName] = useState(item?.name ?? "");
  const [nameAr, setNameAr] = useState(item?.name_ar ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [descriptionAr, setDescriptionAr] = useState(item?.description_ar ?? "");
  const [categoryId, setCategoryId] = useState(
    item?.category_id ?? sortedCategories[0]?.id ?? ""
  );
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? "");
  const [imageStatus, setImageStatus] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function generateDescription() {
    setAiError(null);
    setAiStatus(null);

    if (!itemName.trim()) {
      setAiError("Add an item name first.");
      return;
    }

    setIsGenerating(true);
    setAiStatus("Writing a description...");
    const result = await generateItemDescriptionAction({
      name: itemName,
      category: categoryName(categories, categoryId)
    });
    setIsGenerating(false);

    if (!result.ok) {
      setAiStatus(null);
      setAiError(result.error);
      return;
    }

    setDescription(result.description);
    setAiStatus("Description added. Review it before saving.");
  }

  async function translateToArabic() {
    setAiError(null);
    setAiStatus(null);

    if (!itemName.trim()) {
      setAiError("Add an item name first.");
      return;
    }

    setIsTranslating(true);
    setAiStatus("Translating to Arabic...");
    const result = await translateItemAction({
      name: itemName,
      description
    });
    setIsTranslating(false);

    if (!result.ok) {
      setAiStatus(null);
      setAiError(result.error);
      return;
    }

    if (result.translation.name_ar) {
      setNameAr(result.translation.name_ar);
    }
    if (result.translation.description_ar) {
      setDescriptionAr(result.translation.description_ar);
    }
    setAiStatus("Arabic added. Review it before saving.");
  }

  async function uploadImage(file: File | null) {
    setImageStatus(null);
    setImageError(null);

    if (!file) {
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setImageError("Only JPG, PNG, and WebP images are allowed.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setImageError("Image must be 2MB or smaller.");
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setImageStatus("Optimizing image...");

    // Resize + convert to WebP in the browser so we upload ~30–80 kB instead of
    // a multi-MB phone photo. Falls back to the original file on any failure.
    const optimized = await compressMenuImage(file);

    setImageStatus("Uploading image...");

    const formData = new FormData();
    formData.set("image", optimized);
    formData.set("item_name", itemName || "menu-item");
    if (restaurantId) {
      formData.set("restaurant_id", restaurantId);
    }
    if (item) {
      formData.set("item_id", item.id);
    }

    setIsUploading(true);
    const result = await uploadMenuItemImageAction(formData);
    setIsUploading(false);

    if (!result.ok) {
      setPreviewUrl(null);
      setImageError(result.error);
      return;
    }

    setImageUrl(result.publicUrl);
    setPreviewUrl(null);
    setImageStatus(result.message);
    if (item) {
      router.refresh();
    }
  }

  async function removeImage() {
    setImageUrl("");
    setPreviewUrl(null);
    setImageStatus(item ? "Image removed." : "Image removed. Save item to keep it empty.");
    setImageError(null);

    if (item) {
      const formData = new FormData();
      if (restaurantId) {
        formData.set("restaurant_id", restaurantId);
      }
      formData.set("item_id", item.id);
      await removeMenuItemImageAction(formData);
      router.refresh();
    }
  }

  return (
    <form action={async (formData) => { await action(formData); onDone(); }} className="space-y-3">
      {restaurantId ? <input name="restaurant_id" type="hidden" value={restaurantId} /> : null}
      {item ? <input name="item_id" type="hidden" value={item.id} /> : null}
      <input
        className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2"
        disabled={!canWrite}
        name="name"
        onChange={(event) => setItemName(event.target.value)}
        placeholder="Item name"
        required
        value={itemName}
      />
      <textarea
        className="focus-ring min-h-24 w-full rounded-lg border border-stone-200 px-3 py-2"
        disabled={!canWrite}
        name="description"
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description"
        value={description}
      />
      <div className="rounded-lg border border-dashed border-stone-200 bg-linen/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-black text-ink disabled:opacity-50"
            disabled={!canWrite || isGenerating || isTranslating}
            onClick={() => {
              void generateDescription();
            }}
            type="button"
          >
            <Sparkles size={14} />
            {isGenerating ? "Writing..." : "Generate description"}
          </button>
          <button
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-black text-ink disabled:opacity-50"
            disabled={!canWrite || isTranslating || isGenerating}
            onClick={() => {
              void translateToArabic();
            }}
            type="button"
          >
            <Sparkles size={14} />
            {isTranslating ? "Translating..." : "Translate → عربي"}
          </button>
        </div>
        {aiStatus ? <p className="mt-2 text-xs text-stone-500">{aiStatus}</p> : null}
        {aiError ? <p className="mt-2 text-xs font-bold text-red-600">{aiError}</p> : null}
        <p className="mt-2 text-[11px] text-stone-400">
          AI fills the fields below — review and edit before saving.
        </p>
      </div>
      <input
        className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2 text-right"
        dir="rtl"
        disabled={!canWrite}
        name="name_ar"
        onChange={(event) => setNameAr(event.target.value)}
        placeholder="اسم الصنف بالعربية"
        value={nameAr}
      />
      <textarea
        className="focus-ring min-h-24 w-full rounded-lg border border-stone-200 px-3 py-2 text-right"
        dir="rtl"
        disabled={!canWrite}
        name="description_ar"
        onChange={(event) => setDescriptionAr(event.target.value)}
        placeholder="وصف الصنف بالعربية"
        value={descriptionAr}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2" defaultValue={item?.price ?? ""} disabled={!canWrite} min="0" name="price" placeholder="Price" required step="0.01" type="number" />
        <select className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2" disabled={!canWrite} name="category_id" onChange={(event) => setCategoryId(event.target.value)} required value={categoryId}>
          {sortedCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="rounded-lg border border-stone-200 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-black">Item image</h3>
            <p className="mt-1 text-xs text-stone-500">Optional. JPG, PNG, or WebP up to 2MB.</p>
            <p className="mt-1 text-xs text-stone-500">Create a professional food photo using AI.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AiImageGenerator
              canWrite={canWrite}
              itemId={item?.id}
              itemName={itemName}
              restaurantId={restaurantId}
              onApplied={(url) => {
                setImageUrl(url);
                setPreviewUrl(null);
                setImageStatus("AI image applied.");
                setImageError(null);
                router.refresh();
              }}
            />
            <label className="focus-ring inline-flex cursor-pointer items-center justify-center rounded-lg bg-ink px-3 py-2 text-sm font-black text-white aria-disabled:cursor-not-allowed aria-disabled:opacity-50" aria-disabled={!canWrite || isUploading}>
              {isUploading ? "Uploading..." : "Upload image"}
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={!canWrite || isUploading}
                onChange={(event) => {
                  void uploadImage(event.target.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
            {imageUrl ? (
              <button
                className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm font-black text-red-600 disabled:opacity-50"
                disabled={!canWrite || isUploading}
                onClick={() => {
                  void removeImage();
                }}
                type="button"
              >
                Remove image
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-linen">
          {previewUrl || imageUrl ? (
            // Regular img keeps device-uploaded Supabase Storage URLs visible without remote image config.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={itemName ? `${itemName} preview` : "Menu item preview"}
              className="h-40 w-full object-cover"
              src={previewUrl ?? imageUrl}
            />
          ) : (
            <div className="grid h-40 place-items-center px-4 text-center text-sm font-bold text-ink/50">
              Image preview appears here after upload.
            </div>
          )}
        </div>
        {imageStatus ? <p className="mt-2 text-sm font-semibold text-leaf">{imageStatus}</p> : null}
        {imageError ? <p className="mt-2 text-sm font-semibold text-red-600">{imageError}</p> : null}

        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-black">Advanced: paste image URL manually</summary>
          <input
            className="focus-ring mt-3 w-full rounded-lg border border-stone-200 px-3 py-2"
            disabled={!canWrite}
            name="image_url"
            onChange={(event) => {
              setImageUrl(event.target.value);
              setImageStatus(null);
              setImageError(null);
            }}
            placeholder="https://res.cloudinary.com/... or Supabase public URL"
            value={imageUrl}
          />
        </details>
      </div>
      {optionCatalog && sortedOptionGroups.length > 0 ? (
        <div className="rounded-lg border border-stone-200 p-3">
          <h3 className="text-sm font-black">Variants &amp; add-ons</h3>
          <p className="mt-1 text-xs text-stone-500">
            Attach option groups to this item. Manage the groups themselves in the
            Variants &amp; add-ons section above.
          </p>
          <input
            name="option_group_ids"
            type="hidden"
            value={JSON.stringify(selectedGroupIds)}
          />
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {sortedOptionGroups.map((group) => (
              <label className="flex items-center gap-2 font-semibold" key={group.id}>
                <input
                  checked={selectedGroupIds.includes(group.id)}
                  disabled={!canWrite}
                  onChange={() => toggleGroup(group.id)}
                  type="checkbox"
                />
                {group.name}
                <span className="text-xs font-bold text-stone-400">
                  {group.min_select === 1 && group.max_select === 1
                    ? "variant"
                    : "add-ons"}
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2 font-semibold">
          <input defaultChecked={item?.is_available ?? true} disabled={!canWrite} name="is_available" type="checkbox" />
          Available
        </label>
        <label className="flex items-center gap-2 font-semibold">
          <input defaultChecked={item?.is_featured ?? false} disabled={!canWrite} name="is_featured" type="checkbox" />
          Best Seller
        </label>
      </div>
      <button className="focus-ring w-full rounded-lg bg-leaf px-4 py-3 font-black text-white disabled:opacity-50" disabled={!canWrite} type="submit">
        {item ? "Save item" : "Add item"}
      </button>
    </form>
  );
}

function ImportPreview({
  importMessage,
  isPending,
  rows,
  saveRows,
  updateRow
}: {
  importMessage: string | null;
  isPending: boolean;
  rows: ImportRow[];
  saveRows: () => void;
  updateRow: (rowId: string, changes: Partial<ImportRow>) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg bg-stone-50 p-4 text-sm text-stone-500">
        Upload a CSV or choose a template to preview rows before saving.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="max-h-96 overflow-y-auto rounded-lg border border-stone-200">
        {rows.map((row, index) => (
          <div className="grid gap-2 border-b border-stone-200 p-3 last:border-b-0 lg:grid-cols-[1fr_1fr_1fr_100px]" key={row.id}>
            <input className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm" onChange={(event) => updateRow(row.id, { category: event.target.value })} placeholder="Category" value={row.category} />
            <input className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm" onChange={(event) => updateRow(row.id, { item_name: event.target.value })} placeholder="Item name" value={row.item_name} />
            <input className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm" onChange={(event) => updateRow(row.id, { description: event.target.value })} placeholder="Description" value={row.description} />
            <input className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm" min="0" onChange={(event) => updateRow(row.id, { price: event.target.value })} placeholder="Price" step="0.01" type="number" value={row.price} />
            <div className="flex flex-wrap gap-4 text-xs font-semibold lg:col-span-4">
              <span>Row {index + 1}</span>
              <label className="flex items-center gap-2">
                <input checked={row.is_available} onChange={(event) => updateRow(row.id, { is_available: event.target.checked })} type="checkbox" />
                Available
              </label>
              <label className="flex items-center gap-2">
                <input checked={row.is_featured} onChange={(event) => updateRow(row.id, { is_featured: event.target.checked })} type="checkbox" />
                Best Seller
              </label>
              {row.errors.length > 0 ? <span className="text-red-600">{row.errors.join(", ")}</span> : null}
            </div>
          </div>
        ))}
      </div>
      {importMessage ? (
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700">
          {importMessage}
        </p>
      ) : null}
      <button className="focus-ring w-full rounded-lg bg-leaf px-4 py-3 font-black text-white disabled:opacity-50" disabled={isPending} onClick={saveRows} type="button">
        {isPending ? "Saving..." : `Import ${rows.length} rows`}
      </button>
    </div>
  );
}
