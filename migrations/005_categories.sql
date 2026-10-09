create table terranova.categories (
  id uuid primary key default gen_random_uuid(),
  name_en text not null unique check (length(trim(name_en)) between 1 and 100),
  name_fr text not null check (length(trim(name_fr)) between 1 and 100),
  version integer not null default 1
);
insert into terranova.categories (name_en,name_fr) values
('Men''s Apparel', 'Vêtements pour hommes'),
('Men''s Shorts', 'Shorts pour hommes'),
('Kids', 'Enfants'),
('Home - Cushions', 'Maison – Coussins'),
('Home - Throws', 'Maison – Jetés'),
('Home - Bedding', 'Maison – Literie'),
('Home', 'Maison'),
('Ladies Apparel', 'Vêtements pour femmes'),
('Outdoor', 'Plein air')
on conflict (name_en) do nothing;
insert into terranova.categories (name_en,name_fr)
select distinct category,category from terranova.products
on conflict (name_en) do nothing;
