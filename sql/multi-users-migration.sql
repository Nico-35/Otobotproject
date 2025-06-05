-- =====================================================
-- MIGRATION MULTI-UTILISATEURS OTOBOT
-- =====================================================
-- Ce script ajoute la gestion multi-utilisateurs
-- tout en préservant les données existantes

-- 1. CRÉATION DE LA TABLE USERS
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user', -- 'admin', 'user'
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Un email doit être unique au sein d'un client
    UNIQUE(client_id, email)
);

-- Index pour les performances
CREATE INDEX idx_users_client_id ON users(client_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = true;

-- 2. MIGRATION DE LA TABLE CLIENT_CONNECTIONS
-- =====================================================
-- Ajouter la colonne user_id (nullable temporairement pour la migration)
ALTER TABLE client_connections 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Index pour les performances
CREATE INDEX idx_client_connections_user_id ON client_connections(user_id);

-- 3. ADAPTATION DE LA TABLE CLIENT_SESSIONS
-- =====================================================
-- Ajouter la référence à l'utilisateur
ALTER TABLE client_sessions 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Index pour les performances
CREATE INDEX idx_client_sessions_user_id ON client_sessions(user_id);

-- 4. ADAPTATION DE LA TABLE CLIENT_ACTIVITY_LOGS
-- =====================================================
-- Ajouter qui a fait l'action (utilisateur)
ALTER TABLE client_activity_logs 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Index pour les performances
CREATE INDEX idx_client_activity_logs_user_id ON client_activity_logs(user_id);

-- 5. CRÉATION D'UNE TABLE DE PERMISSIONS
-- =====================================================
-- Pour gérer finement les droits des utilisateurs
CREATE TABLE IF NOT EXISTS user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_code VARCHAR(100) NOT NULL,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by UUID REFERENCES users(id),
    UNIQUE(user_id, permission_code)
);

-- Permissions prédéfinies
INSERT INTO user_permissions (user_id, permission_code)
SELECT id, 'manage_connections' FROM users WHERE role = 'admin'
ON CONFLICT DO NOTHING;

-- 6. CRÉATION D'UNE TABLE D'INVITATIONS
-- =====================================================
-- Pour permettre aux admins d'inviter des utilisateurs
CREATE TABLE IF NOT EXISTS user_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    invitation_token VARCHAR(255) UNIQUE NOT NULL,
    invited_by UUID REFERENCES users(id),
    expires_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. MIGRATION DES DONNÉES EXISTANTES
-- =====================================================
-- Créer un utilisateur "admin" pour chaque client existant
-- basé sur les credentials du client

INSERT INTO users (client_id, email, password_hash, role, last_login_at)
SELECT 
    id as client_id,
    email,
    password_hash,
    'admin' as role,
    last_login_at
FROM clients
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE users.client_id = clients.id AND users.email = clients.email
);

-- Associer les connexions existantes au premier admin de chaque client
UPDATE client_connections cc
SET user_id = (
    SELECT u.id 
    FROM users u 
    WHERE u.client_id = cc.client_id 
    AND u.role = 'admin'
    ORDER BY u.created_at 
    LIMIT 1
)
WHERE cc.user_id IS NULL;

-- Associer les sessions existantes
UPDATE client_sessions cs
SET user_id = (
    SELECT u.id 
    FROM users u 
    WHERE u.client_id = cs.client_id 
    AND u.role = 'admin'
    ORDER BY u.created_at 
    LIMIT 1
)
WHERE cs.user_id IS NULL;

-- 8. VUES ACTUALISÉES
-- =====================================================
-- Vue pour le dashboard par utilisateur
CREATE OR REPLACE VIEW v_user_dashboard AS
SELECT 
    u.id as user_id,
    u.email as user_email,
    u.first_name,
    u.last_name,
    u.role,
    c.company_name,
    COUNT(DISTINCT cc.id) as total_connections,
    COUNT(DISTINCT CASE WHEN cc.token_expires_at > NOW() THEN cc.id END) as active_connections,
    COUNT(DISTINCT CASE WHEN cc.token_expires_at < NOW() THEN cc.id END) as expired_connections,
    MAX(cal.created_at) as last_activity
FROM users u
JOIN clients c ON u.client_id = c.id
LEFT JOIN client_connections cc ON u.id = cc.user_id AND cc.is_active = true
LEFT JOIN client_activity_logs cal ON u.id = cal.user_id
GROUP BY u.id, u.email, u.first_name, u.last_name, u.role, c.company_name;

-- Vue pour les connexions disponibles pour N8N (par utilisateur)
CREATE OR REPLACE VIEW n8n_user_connections AS
SELECT 
    cc.id as connection_id,
    u.id as user_id,
    u.email as user_email,
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
JOIN users u ON cc.user_id = u.id
JOIN clients c ON u.client_id = c.id
JOIN services s ON cc.service_id = s.id
WHERE cc.is_active = true AND u.is_active = true;

-- 9. FONCTIONS MISES À JOUR
-- =====================================================
-- Fonction pour stocker une connexion (maintenant avec user_id)
CREATE OR REPLACE FUNCTION store_user_connection(
    p_user_id UUID,
    p_service_id INTEGER,
    p_connection_name VARCHAR(255),
    p_access_token TEXT,
    p_refresh_token TEXT,
    p_api_key TEXT,
    p_secret TEXT,
    p_token_expires_at TIMESTAMP,
    p_scopes TEXT[],
    p_account_identifier VARCHAR(255),
    p_master_key TEXT
)
RETURNS UUID AS $$
DECLARE
    v_connection_id UUID;
    v_client_id UUID;
BEGIN
    -- Récupérer le client_id depuis le user_id
    SELECT client_id INTO v_client_id FROM users WHERE id = p_user_id;
    
    -- Insertion avec chiffrement
    INSERT INTO client_connections (
        client_id,
        user_id,
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
        v_client_id,
        p_user_id,
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
        'user:' || p_user_id::text, 
        'create'
    );
    
    RETURN v_connection_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour récupérer une connexion déchiffrée (par utilisateur)
CREATE OR REPLACE FUNCTION get_user_decrypted_connection(
    p_user_id UUID,
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
    -- Récupérer l'ID de la connexion active pour cet utilisateur
    SELECT id INTO v_connection_id
    FROM client_connections
    WHERE user_id = p_user_id 
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

-- 10. CONTRAINTES FINALES
-- =====================================================
-- Après migration, rendre user_id obligatoire
-- (À exécuter après avoir vérifié que toutes les connexions ont un user_id)
-- ALTER TABLE client_connections ALTER COLUMN user_id SET NOT NULL;

-- Fonction pour nettoyer les invitations expirées
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS void AS $$
BEGIN
    DELETE FROM user_invitations 
    WHERE expires_at < CURRENT_TIMESTAMP 
    AND accepted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();