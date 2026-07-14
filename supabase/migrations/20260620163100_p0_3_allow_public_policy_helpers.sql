-- WhatsOrder P0-3 correction: allow public SELECT policies to coexist with
-- authenticated and Super Admin policies.
--
-- PostgreSQL may evaluate every permissive SELECT policy on a table. Anonymous
-- menu reads therefore need EXECUTE on the boolean membership helpers used by
-- the other policies. With auth.uid() null, both helpers safely return false.

grant execute on function public.is_restaurant_member(uuid, text[])
to anon, authenticated, service_role;

grant execute on function public.is_super_admin()
to anon, authenticated, service_role;

grant execute on function public.is_public_restaurant(uuid)
to anon, authenticated, service_role;

grant execute on function public.get_public_restaurant(text)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- Rollback consideration:
-- Do not revoke anon EXECUTE while public menu tables also contain policies
-- that call these helpers; doing so breaks otherwise valid public SELECTs.
