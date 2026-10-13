-- Runs only inside the generated disposable Docker database.
DO $assert$
DECLARE
  tab TEXT;
  col RECORD;
  rejected BOOLEAN;
BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'users','tasks','models','recommendations','selections','outcomes',
    'comparisons','local_recommendations','benchmark_snapshots',
    'benchmark_aliases','routed_runs','routed_run_models',
    'model_routability','execution_observations',
    'user_bearing_preferences','password_reset_tokens'
  ] LOOP
    IF to_regclass('public.' || tab) IS NULL THEN
      RAISE EXCEPTION 'Missing expected table: %', tab;
    END IF;
  END LOOP;

  -- A pending migration must remain excluded.
  IF to_regclass('public.magic_tokens') IS NULL THEN
    RAISE EXCEPTION '025 pending migration incorrectly applied';
  END IF;

  FOR col IN SELECT * FROM (VALUES
    ('models','model_class'),('models','provider_model_id'),
    ('models','verification_status'),('tasks','user_id'),
    ('tasks','classification_schema_version'),
    ('benchmark_snapshots','signal_type'),
    ('selections','model_metadata_snapshot'),
    ('selections','choice_context'),
    ('execution_observations','execution_purpose')
  ) AS required(table_name, column_name) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = col.table_name
        AND c.column_name = col.column_name
    ) THEN
      RAISE EXCEPTION 'Missing column %.%', col.table_name, col.column_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype='f' AND conrelid='benchmark_aliases'::regclass
      AND confrelid='models'::regclass
  ) THEN
    RAISE EXCEPTION 'Missing alias-to-model foreign key';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM selections
    WHERE id = '00000000-0000-4000-8000-000000000002'
      AND model_metadata_snapshot->>'snapshot_source' = 'backfill_current_catalogue'
      AND model_metadata_snapshot->>'provider' = 'Fictional Provider'
      AND (model_metadata_snapshot->>'is_open_weight')::boolean
  ) THEN
    RAISE EXCEPTION '032 failed to mark synthetic backfilled model metadata honestly';
  END IF;

  -- Historical unmatched observations must remain representable.
  INSERT INTO benchmark_snapshots (
    source, source_category, source_model_name, bearing_slug, raw_score,
    normalised_score, snapshot_date, signal_type
  ) VALUES (
    'fixture','inference_efficiency','unknown variant',NULL,
    4.2,0.5,DATE '2026-01-01','sustainability'
  );

  INSERT INTO benchmark_aliases (source,source_model_name,bearing_slug)
  VALUES ('fixture','reviewed example','contrib-fixture-model');

  rejected := false;
  BEGIN
    INSERT INTO benchmark_aliases (source,source_model_name,bearing_slug)
    VALUES ('fixture','not-a-model','missing-slug');
  EXCEPTION WHEN foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Alias allowed unknown canonical model'; END IF;

  rejected := false;
  BEGIN
    INSERT INTO model_routability(model_slug,status)
    VALUES ('contrib-fixture-model','invented-status');
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Routability CHECK constraint missing'; END IF;

  IF (SELECT count(*) FROM schema_migrations) < 30 THEN
    RAISE EXCEPTION 'Migration ledger appears incomplete';
  END IF;
END
$assert$;
