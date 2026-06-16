"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCategoryAction,
  addMenuItemAction,
  deleteMenuItemAction,
  importMenuRowsAction,
  toggleMenuItemAvailabilityAction,
  updateMenuItemAction
} from "@/app/actions";
import { formatAED } from "@/lib/currency";
import type { MenuCategory, MenuItem } from "@/lib/types";
import {
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

const csvTemplate = `category,item_name,description,price,is_available,is_featured
Tea & Hot Drinks,Karak Tea,Signature hot karak tea,2,true,true
Burgers,Zinger Burger,Crispy chicken burger,12,true,true
Juices,Fresh Lime Juice,Chilled fresh lime juice,8,true,false
`;

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
  restaurantSlug
}: {
  categories: MenuCategory[];
  items: MenuItem[];
  canWrite: boolean;
  restaurantSlug: string;
}) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateName>("Cafeteria");
  const [isPending, startTransition] = useTransition();

  const visibleItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesCategory = activeCategory === "all" || item.category_id === activeCategory;
      const matchesSearch = !normalizedSearch || item.name.toLowerCase().includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, items, search]);

  const summary = useMemo(
    () => [
      { label: "Total categories", value: categories.length },
      { label: "Total items", value: items.length },
      { label: "Available items", value: items.filter((item) => item.is_available).length },
      { label: "Featured items", value: items.filter((item) => item.is_featured).length }
    ],
    [categories.length, items]
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
        is_featured: ["true", "yes", "1"].includes(value("is_featured").toLowerCase()),
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            {categories.map((category) => (
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
            <p className="mt-2 text-sm text-stone-500">Add an item manually, import a CSV, or start with a sample template.</p>
            <button className="focus-ring mt-4 rounded-full bg-leaf px-4 py-2 text-sm font-black text-white disabled:opacity-50" disabled={!canWrite} onClick={() => setAddItemOpen(true)} type="button">
              Add first item
            </button>
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-lg border border-stone-200">
            <div className="hidden grid-cols-[1.4fr_1fr_120px_120px_120px_170px] gap-3 bg-stone-50 px-4 py-3 text-sm font-black text-stone-600 lg:grid">
              <span>Item</span>
              <span>Category</span>
              <span>Price</span>
              <span>Available</span>
              <span>Featured</span>
              <span>Actions</span>
            </div>
            <div className="divide-y divide-stone-200">
              {visibleItems.map((item) => (
                <div className="grid gap-3 px-4 py-4 lg:grid-cols-[1.4fr_1fr_120px_120px_120px_170px] lg:items-center" key={item.id}>
                  <div>
                    <p className="font-black">{item.name}</p>
                    {item.description ? <p className="mt-1 line-clamp-2 text-sm text-stone-500">{item.description}</p> : null}
                  </div>
                  <p className="text-sm font-bold text-stone-600">{categoryName(categories, item.category_id)}</p>
                  <p className="font-black text-leaf">{formatAED(item.price)}</p>
                  <form action={toggleMenuItemAvailabilityAction}>
                    <input name="item_id" type="hidden" value={item.id} />
                    <input name="is_available" type="hidden" value={String(!item.is_available)} />
                    <button className={`focus-ring rounded-full px-3 py-1.5 text-xs font-black disabled:opacity-50 ${item.is_available ? "bg-mint/20 text-leaf" : "bg-stone-100 text-stone-500"}`} disabled={!canWrite} type="submit">
                      {item.is_available ? "Available" : "Unavailable"}
                    </button>
                  </form>
                  <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-black ${item.is_featured ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-500"}`}>
                    {item.is_featured ? "Featured" : "Standard"}
                  </span>
                  <div className="flex gap-2">
                    <button className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm font-black disabled:opacity-50" disabled={!canWrite} onClick={() => setEditingItem(item)} type="button">
                      Edit
                    </button>
                    <form action={deleteMenuItemAction}>
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
          <ItemForm categories={categories} canWrite={canWrite} onDone={() => { setAddItemOpen(false); router.refresh(); }} />
        </Dialog>
      ) : null}

      {addCategoryOpen ? (
        <Dialog title="Add category" onClose={() => setAddCategoryOpen(false)}>
          <form action={async (formData) => { await addCategoryAction(formData); setAddCategoryOpen(false); router.refresh(); }} className="space-y-3">
            <input className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2" disabled={!canWrite} name="name" placeholder="Breakfast" required />
            <button className="focus-ring w-full rounded-lg bg-ink px-4 py-2 font-bold text-white disabled:opacity-50" disabled={!canWrite} type="submit">
              Add category
            </button>
          </form>
        </Dialog>
      ) : null}

      {editingItem ? (
        <Dialog title={`Edit ${editingItem.name}`} onClose={() => setEditingItem(null)}>
          <ItemForm categories={categories} canWrite={canWrite} item={editingItem} onDone={() => { setEditingItem(null); router.refresh(); }} />
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
  onDone
}: {
  canWrite: boolean;
  categories: MenuCategory[];
  item?: MenuItem;
  onDone: () => void;
}) {
  const action = item ? updateMenuItemAction : addMenuItemAction;

  return (
    <form action={async (formData) => { await action(formData); onDone(); }} className="space-y-3">
      {item ? <input name="item_id" type="hidden" value={item.id} /> : null}
      <input className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2" defaultValue={item?.name ?? ""} disabled={!canWrite} name="name" placeholder="Item name" required />
      <textarea className="focus-ring min-h-24 w-full rounded-lg border border-stone-200 px-3 py-2" defaultValue={item?.description ?? ""} disabled={!canWrite} name="description" placeholder="Description" />
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2" defaultValue={item?.price ?? ""} disabled={!canWrite} min="0" name="price" placeholder="Price" required step="0.01" type="number" />
        <select className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2" defaultValue={item?.category_id ?? categories[0]?.id} disabled={!canWrite} name="category_id" required>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <details className="rounded-lg border border-stone-200 p-3">
        <summary className="cursor-pointer text-sm font-black">Advanced</summary>
        <input className="focus-ring mt-3 w-full rounded-lg border border-stone-200 px-3 py-2" defaultValue={item?.image_url ?? ""} disabled={!canWrite} name="image_url" placeholder="Image URL optional" />
      </details>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2 font-semibold">
          <input defaultChecked={item?.is_available ?? true} disabled={!canWrite} name="is_available" type="checkbox" />
          Available
        </label>
        <label className="flex items-center gap-2 font-semibold">
          <input defaultChecked={item?.is_featured ?? false} disabled={!canWrite} name="is_featured" type="checkbox" />
          Featured
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
                Featured
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
