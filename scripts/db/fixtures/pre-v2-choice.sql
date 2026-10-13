-- Synthetic record inserted before 032 so its historical backfill is
-- exercised. No real users, model measurements or tasks are involved.
INSERT INTO models (
  slug, name, provider, tier, pricing, context_window,
  capabilities, strengths, weaknesses, task_fitness,
  speed_score, privacy_score, transparency, sustainability
) VALUES (
  'contrib-fixture-model', 'Fictional Model', 'Fictional Provider', 'balanced',
  '{"input_per_1m":1,"output_per_1m":2}'::jsonb, 8192,
  '{}'::text[], '{}'::text[], '{}'::text[], '{"summarise":0.8}'::jsonb,
  0.5, 0.5,
  '{"open_weights":0.9,"licence_openness":0.7,"transparency_score":0.8}'::jsonb,
  '{"sustainability_score":0.5}'::jsonb
);
INSERT INTO tasks (id, task_type, complexity, input_length) VALUES
  ('00000000-0000-4000-8000-000000000001', 'summarise', 'simple', 'short');
INSERT INTO selections (id, task_id, model_slug) VALUES
  ('00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000001',
   'contrib-fixture-model');
