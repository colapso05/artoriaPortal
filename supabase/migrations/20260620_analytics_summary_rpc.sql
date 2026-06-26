-- Agrega campo avg_minutes_per_case a company_config (default 30 min)
ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS avg_minutes_per_case INTEGER NOT NULL DEFAULT 30;

-- RPC Vista 1: resumen ejecutivo de analytics
CREATE OR REPLACE FUNCTION get_analytics_summary(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg_minutes INTEGER;
  v_total INTEGER;
  v_resolved INTEGER;
  v_escalated INTEGER;
  v_avg_score NUMERIC;
  v_sentiment JSONB;
  v_resolution_dist JSONB;
  v_top_topics JSONB;
  v_weekly_trend JSONB;
BEGIN
  -- Obtener minutos promedio configurados para la empresa
  SELECT COALESCE(avg_minutes_per_case, 30)
  INTO v_avg_minutes
  FROM company_config
  WHERE company_id = p_company_id;

  IF v_avg_minutes IS NULL THEN
    v_avg_minutes := 30;
  END IF;

  -- Totales base
  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE resolved_autonomously = true)::INTEGER,
    COUNT(*) FILTER (WHERE resolution_type = 'escalado')::INTEGER,
    ROUND(AVG(bot_score)::NUMERIC, 1)
  INTO v_total, v_resolved, v_escalated, v_avg_score
  FROM conversation_analysis
  WHERE company_id = p_company_id
    AND DATE(analyzed_at) BETWEEN p_start_date AND p_end_date;

  -- Distribución de sentimiento
  SELECT jsonb_build_object(
    'positivo', COUNT(*) FILTER (WHERE customer_sentiment = 'positivo'),
    'neutral',  COUNT(*) FILTER (WHERE customer_sentiment = 'neutral'),
    'negativo', COUNT(*) FILTER (WHERE customer_sentiment = 'negativo')
  )
  INTO v_sentiment
  FROM conversation_analysis
  WHERE company_id = p_company_id
    AND DATE(analyzed_at) BETWEEN p_start_date AND p_end_date;

  -- Distribución de tipo de resolución
  SELECT jsonb_object_agg(resolution_type, cnt)
  INTO v_resolution_dist
  FROM (
    SELECT resolution_type, COUNT(*) AS cnt
    FROM conversation_analysis
    WHERE company_id = p_company_id
      AND DATE(analyzed_at) BETWEEN p_start_date AND p_end_date
      AND resolution_type IS NOT NULL
    GROUP BY resolution_type
  ) t;

  -- Top 10 temas más frecuentes
  SELECT jsonb_agg(jsonb_build_object('topic', topic, 'count', cnt) ORDER BY cnt DESC)
  INTO v_top_topics
  FROM (
    SELECT topic, COUNT(*) AS cnt
    FROM conversation_analysis,
         jsonb_array_elements_text(topics) AS topic
    WHERE company_id = p_company_id
      AND DATE(analyzed_at) BETWEEN p_start_date AND p_end_date
      AND topics IS NOT NULL
    GROUP BY topic
    ORDER BY cnt DESC
    LIMIT 10
  ) t;

  -- Tendencia semanal de score
  SELECT jsonb_agg(
    jsonb_build_object(
      'week', week_start,
      'avg_score', ROUND(avg_score::NUMERIC, 1),
      'total', total
    )
    ORDER BY week_start
  )
  INTO v_weekly_trend
  FROM (
    SELECT
      DATE_TRUNC('week', analyzed_at)::DATE AS week_start,
      AVG(bot_score) AS avg_score,
      COUNT(*) AS total
    FROM conversation_analysis
    WHERE company_id = p_company_id
      AND DATE(analyzed_at) BETWEEN p_start_date AND p_end_date
    GROUP BY DATE_TRUNC('week', analyzed_at)
  ) t;

  RETURN jsonb_build_object(
    'total_conversations',       COALESCE(v_total, 0),
    'resolved_autonomously',     COALESCE(v_resolved, 0),
    'escalated_count',           COALESCE(v_escalated, 0),
    'ai_resolution_rate',        CASE WHEN COALESCE(v_total, 0) > 0
                                   THEN ROUND((v_resolved::NUMERIC / v_total) * 100, 1)
                                   ELSE 0 END,
    'escalation_rate',           CASE WHEN COALESCE(v_total, 0) > 0
                                   THEN ROUND((v_escalated::NUMERIC / v_total) * 100, 1)
                                   ELSE 0 END,
    'containment_rate',          CASE WHEN COALESCE(v_total, 0) > 0
                                   THEN ROUND(((v_total - v_escalated)::NUMERIC / v_total) * 100, 1)
                                   ELSE 0 END,
    'avg_bot_score',             COALESCE(v_avg_score, 0),
    'avg_minutes_per_case',      v_avg_minutes,
    'time_saved_minutes',        COALESCE(v_resolved, 0) * v_avg_minutes,
    'time_saved_hours',          ROUND((COALESCE(v_resolved, 0) * v_avg_minutes)::NUMERIC / 60, 1),
    'sentiment_distribution',    COALESCE(v_sentiment, '{}'::JSONB),
    'resolution_type_distribution', COALESCE(v_resolution_dist, '{}'::JSONB),
    'top_topics',                COALESCE(v_top_topics, '[]'::JSONB),
    'weekly_score_trend',        COALESCE(v_weekly_trend, '[]'::JSONB)
  );
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION get_analytics_summary(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_summary(UUID, DATE, DATE) TO service_role;
