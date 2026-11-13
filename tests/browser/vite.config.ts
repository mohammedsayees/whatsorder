import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const path = (value: string) => fileURLToPath(new URL(value, import.meta.url));
export default defineConfig({
 define: { "process.env.NEXT_PUBLIC_DEMO_WHATSAPP_NUMBER": JSON.stringify("971500000000") },
 root: path("./fixture"), server: { host: "127.0.0.1", port: 4173, strictPort: true, fs: { allow: [path("../..")] } },
 oxc: { jsx: { runtime: "automatic" } },
 resolve: { alias: [
  { find: "@/app/admin/orders/quick-product-actions", replacement: path("./fixture/actions.ts") },
  { find: "@/app/admin/orders/actions", replacement: path("./fixture/actions.ts") },
  { find: "@/app/actions", replacement: path("./fixture/actions.ts") },
  { find: "next/link", replacement: path("./fixture/link.tsx") },
  { find: "next/image", replacement: path("./fixture/image.tsx") },
  { find: "next/navigation", replacement: path("./fixture/navigation.ts") },
  { find: "@", replacement: path("../../src") }
 ] }
});
