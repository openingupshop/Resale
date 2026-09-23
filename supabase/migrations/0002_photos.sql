-- Keep the compressed photos so they can be re-downloaded for posting and
-- sent to eBay. Stored at listing-photos/<user_id>/<listing_id>/<n>.jpg.
alter table public.listings
  add column photo_paths text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

create policy "listing photos: read own" on storage.objects
  for select using (
    bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "listing photos: upload own" on storage.objects
  for insert with check (
    bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "listing photos: delete own" on storage.objects
  for delete using (
    bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
