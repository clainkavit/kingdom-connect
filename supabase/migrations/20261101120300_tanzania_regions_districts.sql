with list (name_en, name_sw, districts) as (values
  ('Arusha', 'Arusha', array['Arusha', 'Arumeru', 'Karatu', 'Longido', 'Monduli', 'Ngorongoro']),
  ('Dar es Salaam', 'Dar es Salaam', array['Ilala', 'Kigamboni', 'Kinondoni', 'Temeke', 'Ubungo']),
  ('Dodoma', 'Dodoma', array['Bahi', 'Chamwino', 'Chemba', 'Dodoma', 'Kondoa', 'Kongwa', 'Mpwapwa']),
  ('Geita', 'Geita', array['Bukombe', 'Chato', 'Geita', 'Mbogwe', 'Nyang''hwale']),
  ('Iringa', 'Iringa', array['Iringa', 'Kilolo', 'Mufindi']),
  ('Kagera', 'Kagera', array['Biharamulo', 'Bukoba', 'Karagwe', 'Kyerwa', 'Missenyi', 'Muleba', 'Ngara']),
  ('Katavi', 'Katavi', array['Mlele', 'Mpanda', 'Tanganyika']),
  ('Kigoma', 'Kigoma', array['Buhigwe', 'Kakonko', 'Kasulu', 'Kibondo', 'Kigoma', 'Uvinza']),
  ('Kilimanjaro', 'Kilimanjaro', array['Hai', 'Moshi', 'Mwanga', 'Rombo', 'Same', 'Siha']),
  ('Lindi', 'Lindi', array['Kilwa', 'Lindi', 'Liwale', 'Nachingwea', 'Ruangwa']),
  ('Manyara', 'Manyara', array['Babati', 'Hanang', 'Kiteto', 'Mbulu', 'Simanjiro']),
  ('Mara', 'Mara', array['Bunda', 'Butiama', 'Musoma', 'Rorya', 'Serengeti', 'Tarime']),
  ('Mbeya', 'Mbeya', array['Chunya', 'Kyela', 'Mbarali', 'Mbeya', 'Rungwe']),
  ('Morogoro', 'Morogoro', array['Gairo', 'Kilombero', 'Kilosa', 'Malinyi', 'Morogoro', 'Mvomero', 'Ulanga']),
  ('Mtwara', 'Mtwara', array['Masasi', 'Mtwara', 'Nanyumbu', 'Newala', 'Tandahimba']),
  ('Mwanza', 'Mwanza', array['Ilemela', 'Kwimba', 'Magu', 'Misungwi', 'Nyamagana', 'Sengerema', 'Ukerewe']),
  ('Njombe', 'Njombe', array['Ludewa', 'Makete', 'Njombe', 'Wanging''ombe']),
  ('Pwani', 'Pwani', array['Bagamoyo', 'Kibaha', 'Kibiti', 'Kisarawe', 'Mafia', 'Mkuranga', 'Rufiji']),
  ('Rukwa', 'Rukwa', array['Kalambo', 'Nkasi', 'Sumbawanga']),
  ('Ruvuma', 'Ruvuma', array['Mbinga', 'Namtumbo', 'Nyasa', 'Songea', 'Tunduru']),
  ('Shinyanga', 'Shinyanga', array['Kahama', 'Kishapu', 'Shinyanga']),
  ('Simiyu', 'Simiyu', array['Bariadi', 'Busega', 'Itilima', 'Maswa', 'Meatu']),
  ('Singida', 'Singida', array['Ikungi', 'Iramba', 'Manyoni', 'Mkalama', 'Singida']),
  ('Songwe', 'Songwe', array['Ileje', 'Mbozi', 'Momba', 'Songwe']),
  ('Tabora', 'Tabora', array['Igunga', 'Kaliua', 'Nzega', 'Sikonge', 'Tabora', 'Urambo', 'Uyui']),
  ('Tanga', 'Tanga', array['Handeni', 'Kilindi', 'Korogwe', 'Lushoto', 'Mkinga', 'Muheza', 'Pangani', 'Tanga']),
  ('Pemba North', 'Kaskazini Pemba', array['Micheweni', 'Wete']),
  ('Pemba South', 'Kusini Pemba', array['Chake Chake', 'Mkoani']),
  ('Unguja North', 'Kaskazini Unguja', array['Kaskazini A', 'Kaskazini B']),
  ('Unguja South', 'Kusini Unguja', array['Kati', 'Kusini']),
  ('Urban West', 'Mjini Magharibi', array['Magharibi A', 'Magharibi B', 'Mjini'])
),
regions as (
  insert into public.regions (name_en, name_sw)
  select name_en, name_sw from list
  returning id, name_en
)
insert into public.districts (region_id, name_en, name_sw)
select r.id, d, d
from list l join regions r using (name_en), unnest(l.districts) d;
