grant select on public.platform_settings to anon;

create policy "the platform name, for visitors" on public.platform_settings for select to anon
  using (key = 'platform_name');
