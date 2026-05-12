-- Shipping matrix: France origin to all supported destinations
INSERT INTO shipping_matrix (origin_country, dest_country, weight_class, price) VALUES
  -- FR -> FR (domestic)
  ('FR', 'FR', 'XS', 1.50), ('FR', 'FR', 'S', 2.50), ('FR', 'FR', 'M', 4.50),
  ('FR', 'FR', 'L', 6.90), ('FR', 'FR', 'XL', 9.90),
  -- FR -> BE
  ('FR', 'BE', 'XS', 3.50), ('FR', 'BE', 'S', 4.90), ('FR', 'BE', 'M', 7.90),
  ('FR', 'BE', 'L', 10.90), ('FR', 'BE', 'XL', 14.90),
  -- FR -> LU
  ('FR', 'LU', 'XS', 3.50), ('FR', 'LU', 'S', 4.90), ('FR', 'LU', 'M', 7.90),
  ('FR', 'LU', 'L', 10.90), ('FR', 'LU', 'XL', 14.90),
  -- FR -> DE
  ('FR', 'DE', 'XS', 4.50), ('FR', 'DE', 'S', 5.90), ('FR', 'DE', 'M', 8.90),
  ('FR', 'DE', 'L', 12.90), ('FR', 'DE', 'XL', 16.90),
  -- FR -> ES
  ('FR', 'ES', 'XS', 4.50), ('FR', 'ES', 'S', 5.90), ('FR', 'ES', 'M', 8.90),
  ('FR', 'ES', 'L', 12.90), ('FR', 'ES', 'XL', 16.90),
  -- FR -> IT
  ('FR', 'IT', 'XS', 4.50), ('FR', 'IT', 'S', 5.90), ('FR', 'IT', 'M', 8.90),
  ('FR', 'IT', 'L', 12.90), ('FR', 'IT', 'XL', 16.90),
  -- FR -> CH (outside EU, slightly more)
  ('FR', 'CH', 'XS', 5.90), ('FR', 'CH', 'S', 7.90), ('FR', 'CH', 'M', 11.90),
  ('FR', 'CH', 'L', 15.90), ('FR', 'CH', 'XL', 19.90);
