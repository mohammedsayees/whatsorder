-- WhatsOrder: WhatsApp chat inbox (Phase 2b) — media messages.
--
-- Inbound image/audio/video/document/sticker messages carry a Meta media id
-- whose download URL expires; the webhook downloads the bytes right after
-- acking Meta and stores them in the private `whatsapp-media` bucket. These
-- columns record where the copy lives; admins view media through short-lived
-- signed URLs minted server-side (the bucket has no anon/authenticated
-- policies, so nothing is directly reachable from a browser JWT).

alter table public.whatsapp_messages
  add column if not exists media_path text,
  add column if not exists media_mime text;

-- Private bucket: WhatsApp caps most media at 16 MB. No allowed_mime_types
-- restriction — WhatsApp already constrains formats, and documents can be
-- any type.
insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-media', 'whatsapp-media', false, 16 * 1024 * 1024)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

do $verify_chat_media$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'whatsapp_messages'
      and column_name = 'media_path'
  ) then
    raise exception 'whatsapp_messages.media_path missing';
  end if;

  if exists (
    select 1 from storage.buckets where id = 'whatsapp-media' and public = true
  ) then
    raise exception 'whatsapp-media bucket must stay private';
  end if;
end;
$verify_chat_media$;

notify pgrst, 'reload schema';
