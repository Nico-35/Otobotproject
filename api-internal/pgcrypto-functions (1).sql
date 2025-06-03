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
CREATE OR REPLACE FUNCTION update_connection_tokens(
    p_connection_id UUID,
    p_new_access_token TEXT,
    p_new_refresh_token TEXT,
    p_new_expires_at TIMESTAMP,
    p_master_key TEXT
)
RETURNS VOID AS $
BEGIN
    -- Mise à jour avec chiffrement des nouveaux tokens
    UPDATE client_connections
    SET 
        encrypted_access_token = CASE 
            WHEN p_new_access_token IS NOT NULL 
            THEN pgp_sym_encrypt(p_new_access_token, p_master_key)::TEXT 
            ELSE encrypted_access_token 
        END,
        encrypted_refresh_token = CASE 
            WHEN p_new_refresh_token IS NOT NULL 
            THEN pgp_sym_encrypt(p_new_refresh_token, p_master_key)::TEXT 
            ELSE encrypted_refresh_token 
        END,
        token_expires_at = COALESCE(p_new_expires_at, token_expires_at),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_connection_id;
    
    -- Log de l'action
    INSERT INTO credential_access_logs (
        client_connection_id, 
        accessed_by, 
        access_type
    ) VALUES (
        p_connection_id, 
        'system', 
        'refresh'
    );
END;
$ LANGUAGE plpgsql;

-- Fonction pour lister les connexions expirées nécessitant un refresh
CREATE OR REPLACE FUNCTION get_expired_connections()
RETURNS TABLE (
    connection_id UUID,
    client_id UUID,
    service_id INTEGER,
    service_name VARCHAR(100),
    token_expires_at TIMESTAMP,
    has_refresh_token BOOLEAN
) AS $
BEGIN
    RETURN QUERY
    SELECT 
        cc.id,
        cc.client_id,
        cc.service_id,
        s.name,
        cc.token_expires_at,
        (cc.encrypted_refresh_token IS NOT NULL) as has_refresh_token
    FROM client_connections cc
    JOIN services s ON cc.service_id = s.id
    WHERE cc.is_active = true
      AND cc.token_expires_at < NOW() + INTERVAL '1 hour'
      AND cc.encrypted_refresh_token IS NOT NULL
    ORDER BY cc.token_expires_at ASC;
END;
$ LANGUAGE plpgsql;

-- Fonction pour enregistrer une erreur de refresh
CREATE OR REPLACE FUNCTION log_token_refresh_error(
    p_connection_id UUID,
    p_error_type VARCHAR(100),
    p_error_message TEXT
)
RETURNS VOID AS $
DECLARE
    v_existing_error_id UUID;
BEGIN
    -- Vérifier s'il existe déjà une erreur non résolue pour cette connexion
    SELECT id INTO v_existing_error_id
    FROM token_refresh_errors
    WHERE client_connection_id = p_connection_id
      AND resolved_at IS NULL
    LIMIT 1;
    
    IF v_existing_error_id IS NOT NULL THEN
        -- Mettre à jour l'erreur existante
        UPDATE token_refresh_errors
        SET 
            error_type = p_error_type,
            error_message = p_error_message,
            retry_count = retry_count + 1,
            last_retry_at = CURRENT_TIMESTAMP
        WHERE id = v_existing_error_id;
    ELSE
        -- Créer une nouvelle entrée d'erreur
        INSERT INTO token_refresh_errors (
            client_connection_id,
            error_type,
            error_message
        ) VALUES (
            p_connection_id,
            p_error_type,
            p_error_message
        );
    END IF;
    
    -- Log dans credential_access_logs aussi
    INSERT INTO credential_access_logs (
        client_connection_id,
        accessed_by,
        access_type,
        success,
        error_message
    ) VALUES (
        p_connection_id,
        'system',
        'refresh',
        false,
        p_error_message
    );
END;
$ LANGUAGE plpgsql;

-- Vue sécurisée pour N8N (sans données sensibles)
CREATE OR REPLACE VIEW n8n_available_connections AS
SELECT 
    cc.id as connection_id,
    c.id as client_id,
    c.email as client_email,
    s.name as service_name,
    s.display_name as service_display_name,
    cc.connection_name,
    cc.account_identifier,
    cc.token_expires_at,
    cc.last_used_at,
    CASE 
        WHEN cc.token_expires_at IS NULL THEN 'valid'
        WHEN cc.token_expires_at > NOW() THEN 'valid'
        WHEN cc.encrypted_refresh_token IS NOT NULL THEN 'refresh_needed'
        ELSE 'expired'
    END as status
FROM client_connections cc
JOIN clients c ON cc.client_id = c.id
JOIN services s ON cc.service_id = s.id
WHERE cc.is_active = true;