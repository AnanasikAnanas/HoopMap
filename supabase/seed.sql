-- Optional demo courts for a new HOOPMAP project.
-- Run after bootstrap.sql. Re-running does not create duplicates.

insert into public.courts (
  name, slug, description, address, city, country, latitude, longitude,
  court_type, access_type, surface, hoops_count, has_lighting, has_marking,
  has_nets, condition, status, source, source_id, verified_at
)
values
  ('Парк Победы', 'demo-park-pobedy', 'Открытая площадка, добавленная сообществом HOOPMAP.', 'Парк Победы', 'Тольятти', 'Россия', 53.5308, 49.2786, 'outdoor', 'free', 'rubber', 2, true, true, true, 'good', 'published', 'demo', '1', now()),
  ('Набережная 6 квартала', 'demo-naberezhnaya-6', 'Площадка рядом с набережной.', 'Приморский бульвар', 'Тольятти', 'Россия', 53.5142, 49.2510, 'full', 'free', 'asphalt', 2, false, true, true, 'good', 'published', 'demo', '2', now()),
  ('Фанни Парк', 'demo-fanny-park', 'Уличная баскетбольная площадка.', 'Улица Фрунзе, 16Б', 'Тольятти', 'Россия', 53.5236, 49.2819, 'outdoor', 'free', 'rubber', 2, true, true, true, 'excellent', 'published', 'demo', '3', now()),
  ('Сквер Жилкина', 'demo-zhilkin-square', 'Небольшая площадка в сквере.', 'Сквер Жилкина', 'Тольятти', 'Россия', 53.5105, 49.2918, 'half', 'free', 'asphalt', 1, false, true, false, 'fair', 'published', 'demo', '4', now()),
  ('Школа №70', 'demo-school-70', 'Доступ может быть ограничен в учебное время.', 'Улица 40 лет Победы, 82', 'Тольятти', 'Россия', 53.5484, 49.3150, 'full', 'restricted', 'rubber', 2, true, true, true, 'good', 'published', 'demo', '5', now()),
  ('Олимп', 'demo-olimp', 'Спортивная площадка возле комплекса.', 'Приморский бульвар, 49', 'Тольятти', 'Россия', 53.5188, 49.2344, 'full', 'free', 'rubber', 2, true, true, true, 'excellent', 'published', 'demo', '6', now()),
  ('Итальянский сквер', 'demo-italian-square', 'Открытая площадка в жилом квартале.', 'Итальянский бульвар', 'Тольятти', 'Россия', 53.5420, 49.2828, 'half', 'free', 'asphalt', 1, false, true, true, 'good', 'published', 'demo', '7', now()),
  ('Лесопарковое шоссе', 'demo-lesopark', 'Площадка рядом с лесной зоной.', 'Лесопарковое шоссе', 'Тольятти', 'Россия', 53.5017, 49.3468, 'outdoor', 'free', 'concrete', 2, false, true, false, 'fair', 'published', 'demo', '8', now()),
  ('Центральный парк', 'demo-central-park', 'Городская площадка в центральном районе.', 'Центральный парк', 'Тольятти', 'Россия', 53.5071, 49.4097, 'full', 'free', 'asphalt', 2, true, true, true, 'good', 'published', 'demo', '9', now()),
  ('Спортивная 12', 'demo-sportivnaya-12', 'Дворовая площадка.', 'Спортивная улица, 12', 'Тольятти', 'Россия', 53.4965, 49.2529, 'half', 'free', 'asphalt', 1, false, true, false, 'fair', 'published', 'demo', '10', now()),
  ('Комсомольский парк', 'demo-komsomol-park', 'Площадка в Комсомольском районе.', 'Комсомольский парк', 'Тольятти', 'Россия', 53.4805, 49.4709, 'outdoor', 'free', 'rubber', 2, true, true, true, 'good', 'published', 'demo', '11', now()),
  ('Молодёжный бульвар', 'demo-youth-boulevard', 'Открытая дворовая площадка.', 'Молодёжный бульвар', 'Тольятти', 'Россия', 53.5167, 49.4198, 'full', 'free', 'asphalt', 2, false, true, true, 'good', 'published', 'demo', '12', now()),
  ('Тополиная', 'demo-topolinaya', 'Площадка между жилыми домами.', 'Тополиная улица', 'Тольятти', 'Россия', 53.5556, 49.3356, 'half', 'free', 'concrete', 1, false, true, false, 'fair', 'published', 'demo', '13', now()),
  ('Южное шоссе', 'demo-south-highway', 'Спортивная зона рядом с жилым кварталом.', 'Южное шоссе', 'Тольятти', 'Россия', 53.5369, 49.3572, 'full', 'free', 'rubber', 2, true, true, true, 'excellent', 'published', 'demo', '14', now()),
  ('Революционная 52', 'demo-revolutsionnaya-52', 'Дворовая баскетбольная площадка.', 'Революционная улица, 52', 'Тольятти', 'Россия', 53.5264, 49.2698, 'half', 'free', 'asphalt', 1, false, true, true, 'good', 'published', 'demo', '15', now()),
  ('Автозаводской парк', 'demo-avtozavod-park', 'Просторная площадка в парке.', 'Автозаводской парк', 'Тольятти', 'Россия', 53.5398, 49.3042, 'full', 'free', 'rubber', 2, true, true, true, 'excellent', 'published', 'demo', '16', now()),
  ('Певческое поле', 'demo-singing-field', 'Уличная площадка рядом с зоной отдыха.', 'Певческое поле', 'Тольятти', 'Россия', 53.4893, 49.3527, 'outdoor', 'free', 'asphalt', 2, false, true, false, 'good', 'published', 'demo', '17', now()),
  ('Стадион Торпедо', 'demo-torpedo', 'Площадка рядом со стадионом.', 'Улица Родины, 40', 'Тольятти', 'Россия', 53.5148, 49.4032, 'full', 'restricted', 'rubber', 2, true, true, true, 'excellent', 'published', 'demo', '18', now()),
  ('Сквер Маяковского', 'demo-mayakovsky', 'Компактная площадка в сквере.', 'Улица Маяковского', 'Тольятти', 'Россия', 53.4908, 49.4501, 'half', 'free', 'asphalt', 1, false, true, false, 'fair', 'published', 'demo', '19', now()),
  ('Шлюзовой', 'demo-shlyuzovoy', 'Открытая площадка в микрорайоне Шлюзовой.', 'Улица Гидротехническая', 'Тольятти', 'Россия', 53.4597, 49.5571, 'outdoor', 'free', 'concrete', 2, false, true, true, 'good', 'published', 'demo', '20', now())
on conflict (source, source_id) where source <> '' and source_id <> ''
do update set
  name = excluded.name,
  address = excluded.address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  status = excluded.status,
  updated_at = now();
