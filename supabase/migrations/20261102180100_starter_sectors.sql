insert into public.sectors (name_en, name_sw) values
  ('Agriculture', 'Kilimo'),
  ('Trade', 'Biashara'),
  ('Construction', 'Ujenzi'),
  ('Transport and logistics', 'Usafirishaji na usambazaji'),
  ('Tourism and hospitality', 'Utalii na ukarimu'),
  ('ICT', 'TEHAMA'),
  ('Finance', 'Fedha'),
  ('Education', 'Elimu'),
  ('Health', 'Afya'),
  ('Energy', 'Nishati'),
  ('Manufacturing', 'Viwanda'),
  ('Mining', 'Madini'),
  ('Real estate', 'Mali isiyohamishika'),
  ('Creative and media', 'Sanaa na habari'),
  ('Professional services', 'Huduma za kitaalamu'),
  ('Other', 'Nyingine')
on conflict (name_en) do nothing;
