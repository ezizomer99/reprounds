UPDATE exercises
SET type = 'conditioning'
WHERE muscle_group = 'Cardio'
  AND user_id IS NULL;
