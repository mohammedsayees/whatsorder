alter table restaurants
add column if not exists name_ar text,
add column if not exists address_ar text,
add column if not exists subtitle_ar text;

alter table menu_categories
add column if not exists name_ar text;

alter table menu_items
add column if not exists name_ar text,
add column if not exists description_ar text;
