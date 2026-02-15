
-- Fix search_path for calculate_rounded_amount
CREATE OR REPLACE FUNCTION public.calculate_rounded_amount(p_amount integer, p_rounding_multiple integer DEFAULT 500, p_round_down boolean DEFAULT true)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_round_down THEN
    RETURN FLOOR(p_amount::DECIMAL / p_rounding_multiple) * p_rounding_multiple;
  ELSE
    RETURN CEILING(p_amount::DECIMAL / p_rounding_multiple) * p_rounding_multiple;
  END IF;
END;
$function$;

-- Fix search_path for cleanup_keep_alive_logs
CREATE OR REPLACE FUNCTION public.cleanup_keep_alive_logs()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    DELETE FROM _keep_alive_log 
    WHERE pinged_at < NOW() - INTERVAL '30 days';
END;
$function$;

-- Fix search_path for generate_student_code
CREATE OR REPLACE FUNCTION public.generate_student_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT := 'STU';
  v_date_part TEXT;
  v_random_part TEXT;
BEGIN
  IF NEW.student_code IS NULL OR TRIM(NEW.student_code) = '' THEN
    v_date_part := TO_CHAR(NOW(), 'YYMMDD');
    v_random_part := UPPER(SUBSTRING(REPLACE(NEW.id::TEXT, '-', ''), 1, 6));
    NEW.student_code := v_prefix || '-' || v_date_part || '-' || v_random_part;
  END IF;

  IF NEW.nik IS NOT NULL THEN
    NEW.nik := TRIM(NEW.nik);
  END IF;

  NEW.name := TRIM(NEW.name);
  NEW.class := TRIM(NEW.class);

  RETURN NEW;
END;
$function$;

-- Fix search_path for keep_alive_ping
CREATE OR REPLACE FUNCTION public.keep_alive_ping()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    result JSONB;
BEGIN
    INSERT INTO _keep_alive_log (pinged_at, source)
    VALUES (NOW(), 'rpc')
    RETURNING jsonb_build_object(
        'id', id,
        'pinged_at', pinged_at,
        'source', source
    ) INTO result;
    
    RETURN result;
END;
$function$;
