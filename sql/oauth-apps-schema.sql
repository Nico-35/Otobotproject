-- =====================================================
-- SCHEMA OAUTH APPLICATIONS SÉCURISÉES (VERSION CORRIGÉE)
-- =====================================================
-- Compatible avec PostgreSQL 12+

-- 1. TABLE DES APPLICATIONS OAUTH
-- =====================================================
CREATE TABLE oauth_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Lien optionnel vers un client (NULL = app globale Otobot)
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    
    -- Service concerné (notion, google, microsoft, etc.)
    service_id INTEGER NOT NULL REFERENCES services(id),
    
    -- Nom de l'application (pour l'affichage)
    app_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Credentials OAuth chiffrés
    encrypted_client_id TEXT NOT NULL,      -- OAuth Client ID chiffré
    encrypted_client_secret TEXT NOT NULL,  -- OAuth Client Secret chiffré
    
    -- Configuration OAuth
    redirect_uri TEXT NOT NULL,
    scopes TEXT[], -- Permissions demandées
    
    -- Métadonnées
    is_active BOOLEAN DEFAULT true,
    is_global BOOLEAN DEFAULT false, -- true = app Otobot pour tous
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    
    -- Contrainte : soit globale, soit liée à un client
    CONSTRAINT oauth_app_scope CHECK (
        (is_global = true AND client_id IS NULL) OR 
        (is_global = false AND client_id IS NOT NULL)
    )
);

-- Index pour les performances
CREATE INDEX idx_oauth_apps_client ON oauth_applications(client_id);
CREATE INDEX idx_oauth_apps_service ON oauth_applications(service_id);
CREATE INDEX idx_oauth_apps_global ON oauth_applications(is_global, is_active);

-- Index unique pour garantir une seule app globale active par service
CREATE UNIQUE INDEX unique_global_app_per_service 
ON oauth_applications(service_id) 
WHERE is_global = true AND is_active = true;

-- Index unique pour garantir une seule app active par client et service
CREATE UNIQUE INDEX unique_client_app_per_service 
ON oauth_applications(client_id, service_id) 
WHERE is_active = true AND client_id IS NOT NULL;

-- 2. TABLE DE CONFIGURATION OAUTH PAR UTILISATEUR
-- =====================================================
CREATE TABLE user_oauth_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES services(id),
    
    -- L'app OAuth choisie (NULL = utiliser la config par défaut)
    oauth_app_id UUID REFERENCES oauth_applications(id) ON DELETE SET NULL,
    
    -- Préférence : 'client_app', 'global_app', 'own_app'
    preference_type VARCHAR(20) DEFAULT 'global_app',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, service_id)
);

-- 3. LOGS D'UTILISATION DES APPS OAUTH
-- =====================================================
CREATE TABLE oauth_app_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oauth_app_id UUID REFERENCES oauth_applications(id),
    user_id UUID REFERENCES users(id),
    action VARCHAR(50), -- 'authorize', 'token_refresh', 'revoke'
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour les analyses
CREATE INDEX idx_oauth_usage_app ON oauth_app_usage_logs(oauth_app_id);
CREATE INDEX idx_oauth_usage_user ON oauth_app_usage_logs(user_id);
CREATE INDEX idx_oauth_usage_date ON oauth_app_usage_logs(created_at);

-- 4. FONCTIONS POUR GÉRER LES OAUTH APPS
-- =====================================================

-- Fonction pour créer/mettre à jour une app OAuth
CREATE OR REPLACE FUNCTION upsert_oauth_application(
    p_client_id UUID,           -- NULL pour app globale
    p_service_name VARCHAR(100),
    p_app_name VARCHAR(255),
    p_client_id_clear TEXT,     -- OAuth Client ID en clair
    p_client_secret_clear TEXT, -- OAuth Client Secret en clair
    p_redirect_uri TEXT,
    p_scopes TEXT[],
    p_created_by UUID,
    p_master_key TEXT           -- Clé de chiffrement
)
RETURNS UUID AS $$
DECLARE
    v_service_id INTEGER;
    v_app_id UUID;
    v_is_global BOOLEAN;
BEGIN
    -- Récupérer l'ID du service
    SELECT id INTO v_service_id FROM services WHERE name = p_service_name;
    IF v_service_id IS NULL THEN
        RAISE EXCEPTION 'Service % non trouvé', p_service_name;
    END IF;
    
    -- Déterminer si c'est une app globale
    v_is_global := (p_client_id IS NULL);
    
    -- Chercher une app existante
    SELECT id INTO v_app_id
    FROM oauth_applications
    WHERE (
        (v_is_global = true AND is_global = true AND service_id = v_service_id) OR
        (v_is_global = false AND client_id = p_client_id AND service_id = v_service_id)
    )
    AND is_active = true;
    
    IF v_app_id IS NOT NULL THEN
        -- Mettre à jour l'existante
        UPDATE oauth_applications
        SET 
            app_name = p_app_name,
            encrypted_client_id = pgp_sym_encrypt(p_client_id_clear, p_master_key)::TEXT,
            encrypted_client_secret = pgp_sym_encrypt(p_client_secret_clear, p_master_key)::TEXT,
            redirect_uri = p_redirect_uri,
            scopes = p_scopes,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_app_id;
    ELSE
        -- Créer une nouvelle
        INSERT INTO oauth_applications (
            client_id,
            service_id,
            app_name,
            encrypted_client_id,
            encrypted_client_secret,
            redirect_uri,
            scopes,
            is_global,
            created_by
        ) VALUES (
            p_client_id,
            v_service_id,
            p_app_name,
            pgp_sym_encrypt(p_client_id_clear, p_master_key)::TEXT,
            pgp_sym_encrypt(p_client_secret_clear, p_master_key)::TEXT,
            p_redirect_uri,
            p_scopes,
            v_is_global,
            p_created_by
        ) RETURNING id INTO v_app_id;
    END IF;
    
    RETURN v_app_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour récupérer les credentials OAuth déchiffrés
CREATE OR REPLACE FUNCTION get_oauth_credentials(
    p_user_id UUID,
    p_service_name VARCHAR(100),
    p_master_key TEXT
)
RETURNS TABLE (
    app_id UUID,
    app_name VARCHAR(255),
    client_id TEXT,
    client_secret TEXT,
    redirect_uri TEXT,
    scopes TEXT[],
    app_type VARCHAR(20) -- 'global', 'client', 'custom'
) AS $$
DECLARE
    v_service_id INTEGER;
    v_client_id UUID;
    v_oauth_app_id UUID;
    v_preference_type VARCHAR(20);
BEGIN
    -- Récupérer l'ID du service
    SELECT id INTO v_service_id FROM services WHERE name = p_service_name;
    
    -- Récupérer le client_id de l'utilisateur
    SELECT client_id INTO v_client_id FROM users WHERE id = p_user_id;
    
    -- Vérifier les préférences de l'utilisateur
    SELECT oauth_app_id, preference_type 
    INTO v_oauth_app_id, v_preference_type
    FROM user_oauth_preferences
    WHERE user_id = p_user_id AND service_id = v_service_id;
    
    -- Si pas de préférence, ordre de priorité :
    -- 1. App du client (si existe)
    -- 2. App globale Otobot
    IF v_oauth_app_id IS NULL THEN
        -- Chercher d'abord une app client
        SELECT id INTO v_oauth_app_id
        FROM oauth_applications
        WHERE client_id = v_client_id 
          AND service_id = v_service_id 
          AND is_active = true
        LIMIT 1;
        
        -- Si pas d'app client, prendre la globale
        IF v_oauth_app_id IS NULL THEN
            SELECT id INTO v_oauth_app_id
            FROM oauth_applications
            WHERE is_global = true 
              AND service_id = v_service_id 
              AND is_active = true
            LIMIT 1;
        END IF;
    END IF;
    
    -- Retourner les credentials déchiffrés
    RETURN QUERY
    SELECT 
        oa.id,
        oa.app_name,
        pgp_sym_decrypt(oa.encrypted_client_id::bytea, p_master_key) as client_id,
        pgp_sym_decrypt(oa.encrypted_client_secret::bytea, p_master_key) as client_secret,
        oa.redirect_uri,
        oa.scopes,
        CASE 
            WHEN oa.is_global THEN 'global'
            WHEN oa.client_id IS NOT NULL THEN 'client'
            ELSE 'custom'
        END as app_type
    FROM oauth_applications oa
    WHERE oa.id = v_oauth_app_id;
END;
$$ LANGUAGE plpgsql;

-- 5. MIGRATION DES DONNÉES EXISTANTES
-- =====================================================

-- Ajouter la référence à l'app OAuth dans client_connections
ALTER TABLE client_connections 
ADD COLUMN IF NOT EXISTS oauth_app_id UUID REFERENCES oauth_applications(id);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_client_connections_oauth_app ON client_connections(oauth_app_id);

-- 6. VUES POUR L'ADMINISTRATION
-- =====================================================

-- Vue des apps OAuth (sans données sensibles)
CREATE OR REPLACE VIEW v_oauth_applications AS
SELECT 
    oa.id,
    oa.client_id,
    c.company_name as client_name,
    s.name as service_name,
    s.display_name as service_display_name,
    oa.app_name,
    oa.description,
    oa.redirect_uri,
    oa.scopes,
    oa.is_active,
    oa.is_global,
    oa.created_at,
    oa.updated_at,
    u.email as created_by_email,
    (
        SELECT COUNT(*) 
        FROM client_connections cc 
        WHERE cc.oauth_app_id = oa.id
    ) as connection_count
FROM oauth_applications oa
JOIN services s ON oa.service_id = s.id
LEFT JOIN clients c ON oa.client_id = c.id
LEFT JOIN users u ON oa.created_by = u.id;

-- 7. TRIGGERS
-- =====================================================
CREATE TRIGGER update_oauth_apps_updated_at BEFORE UPDATE ON oauth_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_user_oauth_prefs_updated_at BEFORE UPDATE ON user_oauth_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();