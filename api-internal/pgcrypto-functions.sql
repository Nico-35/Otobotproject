-- ================================================
-- FONCTIONS DE CHIFFREMENT AVEC PGCRYPTO
-- ================================================

-- Fonction pour stocker une nouvelle connexion avec chiffrement
CREATE OR REPLACE FUNCTION store_client_connection(
    p_client_id UUID,
    p_service_id INTEGER,
    p_connection_name VARCHAR(255),
    p_access_token TEXT,
    p_refresh_token TEXT,
    p_api_key TEXT,
    p_secret TEXT,
    p_token_expires_at TIMESTAMP,
    p_scopes TEXT[],
    p_account_identifier VARCHAR(255),
    p_master_key TEXT  -- La clé de chiffrement
)
RETURNS UUID AS $$
DECLARE
    v_connection_id UUID;
BEGIN
    -- Insertion avec chiffrement des données sensibles
    INSERT INTO client_connections (
        client_id, 
        service_id, 
        connection_name,
        encrypted_access_token,
        encrypted_refresh_token,
        encrypted_api_key,
        encrypted_secret,
        token_expires_at,
        scopes,
        account_identifier
    ) VALUES (
        p_client_id,
        p_service_id,
        p_connection_name,
        CASE WHEN p_access_token IS NOT NULL 
             THEN pgp_sym_encrypt(p_access_token, p_master_key)::TEXT 
             ELSE NULL END,
        CASE WHEN p_refresh_token IS NOT NULL 
             THEN pgp_sym_encrypt(p_refresh_token, p_master_key)::TEXT 
             ELSE NULL END,
        CASE WHEN p_api_key IS NOT NULL 
             THEN pgp_sym_encrypt(p_api_key, p_master_key)::TEXT 
             ELSE NULL END,
        CASE WHEN p_secret IS NOT NULL 
             THEN pgp_sym_encrypt(p_secret, p_master_key)::TEXT 
             ELSE NULL END,
        p_token_expires_at,
        p_scopes,
        p_account_identifier
    ) RETURNING id INTO v_connection_id;
    
    -- Log de l'action
    INSERT INTO credential_access_logs (
        client_connection_id, 
        accessed_by, 
        access_type
    ) VALUES (
        v_connection_id, 
        'system', 
        'create'
    );
    
    RETURN v_connection_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour récupérer et déchiffrer une connexion
CREATE OR REPLACE FUNCTION get_decrypted_connection(
    p_client_id UUID,
    p_service_id INTEGER,
    p_master_key TEXT,
    p_accessed_by VARCHAR(100) DEFAULT 'system'
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
    v_connection_id UUID;
BEGIN
    -- Récupérer l'ID de la connexion active
    SELECT id INTO v_connection_id
    FROM client_connections
    WHERE client_id = p_client_id 
      AND service_id = p_service_id 
      AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_connection_id IS NULL THEN
        RETURN;
    END IF;
    
    -- Log de l'accès
    INSERT INTO credential_access_logs (
        client_connection_id, 
        accessed_by, 
        access_type
    ) VALUES (
        v_connection_id, 
        p_accessed_by, 
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
        CASE WHEN cc.encrypted_access_token IS NOT NULL 
             THEN pgp_sym_decrypt(cc.encrypted_access_token::bytea, p_master_key)
             ELSE NULL END,
        CASE WHEN cc.encrypted_refresh_token IS NOT NULL 
             THEN pgp_sym_decrypt(cc.encrypted_refresh_token::bytea, p_master_key)
             ELSE NULL END,
        CASE WHEN cc.encrypted_api_key IS NOT NULL 
             THEN pgp_sym_decrypt(cc.encrypted_api_key::bytea, p_master_key)
             ELSE NULL END,
        CASE WHEN cc.encrypted_secret IS NOT NULL 
             THEN pgp_sym_decrypt(cc.encrypted_secret::bytea, p_master_key)
             ELSE NULL END,
        cc.token_expires_at,
        cc.scopes,
        cc.account_identifier
    FROM client_connections cc
    WHERE cc.id = v_connection_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour mettre à jour les tokens après refresh