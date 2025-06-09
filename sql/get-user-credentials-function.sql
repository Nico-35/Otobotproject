-- Fonction pour récupérer et déchiffrer les credentials d'un utilisateur
CREATE OR REPLACE FUNCTION get_user_credentials(
    p_user_id UUID,
    p_service_name VARCHAR,
    p_master_key TEXT
)
RETURNS TABLE (
    connection_id UUID,
    connection_name VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    api_key TEXT,
    secret TEXT,
    token_expires_at TIMESTAMP,
    scopes TEXT[],
    account_identifier VARCHAR(255)
) AS $$
DECLARE
    v_service_id INTEGER;
    v_connection_id UUID;
BEGIN
    -- Récupérer l'ID du service
    SELECT id INTO v_service_id
    FROM services
    WHERE name = p_service_name AND is_active = true;
    
    IF v_service_id IS NULL THEN
        RETURN; -- Pas de service trouvé
    END IF;
    
    -- Récupérer l'ID de la connexion active
    SELECT cc.id INTO v_connection_id
    FROM client_connections cc
    JOIN users u ON cc.user_id = u.id
    WHERE cc.user_id = p_user_id 
      AND cc.service_id = v_service_id 
      AND cc.is_active = true
      AND u.is_active = true
    ORDER BY cc.created_at DESC
    LIMIT 1;
    
    IF v_connection_id IS NULL THEN
        RETURN; -- Pas de connexion trouvée
    END IF;
    
    -- Log de l'accès
    INSERT INTO credential_access_logs (
        client_connection_id, 
        accessed_by, 
        access_type
    ) VALUES (
        v_connection_id, 
        'n8n', 
        'read'
    );
    
    -- Mise à jour de last_used_at
    UPDATE client_connections 
    SET last_used_at = CURRENT_TIMESTAMP 
    WHERE id = v_connection_id;
    
    -- Retourner les données déchiffrées
    RETURN QUERY
    SELECT 
        cc.id,
        cc.connection_name,
        CASE 
            WHEN cc.encrypted_access_token IS NOT NULL 
            THEN pgp_sym_decrypt(cc.encrypted_access_token::bytea, p_master_key)
            ELSE NULL 
        END as access_token,
        CASE 
            WHEN cc.encrypted_refresh_token IS NOT NULL 
            THEN pgp_sym_decrypt(cc.encrypted_refresh_token::bytea, p_master_key)
            ELSE NULL 
        END as refresh_token,
        CASE 
            WHEN cc.encrypted_api_key IS NOT NULL 
            THEN pgp_sym_decrypt(cc.encrypted_api_key::bytea, p_master_key)
            ELSE NULL 
        END as api_key,
        CASE 
            WHEN cc.encrypted_secret IS NOT NULL 
            THEN pgp_sym_decrypt(cc.encrypted_secret::bytea, p_master_key)
            ELSE NULL 
        END as secret,
        cc.token_expires_at,
        cc.scopes,
        cc.account_identifier
    FROM client_connections cc
    WHERE cc.id = v_connection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Donner les permissions à frontend_user
GRANT EXECUTE ON FUNCTION get_user_credentials(UUID, VARCHAR, TEXT) TO frontend_user;