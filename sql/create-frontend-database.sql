-- ==============================================
-- SCRIPT DE CRÉATION DE LA BASE DE DONNÉES FRONTEND
-- ==============================================

-- Table principale des clients
-- Stocke les informations de base de chaque client
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    company_name VARCHAR(255),
    password_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des services disponibles
-- Liste tous les services externes que vos clients peuvent connecter
CREATE TABLE services (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,      -- Identifiant technique : 'google', 'facebook', etc.
    display_name VARCHAR(100) NOT NULL,     -- Nom affiché : 'Google Workspace', 'Facebook Business'
    oauth_type VARCHAR(50) NOT NULL,        -- Type d'auth : 'oauth2', 'api_key', 'basic_auth'
    is_active BOOLEAN DEFAULT true,
    
    -- Configuration OAuth2 (si applicable)
    oauth_authorization_url TEXT,           -- URL pour initier OAuth2
    oauth_token_url TEXT,                   -- URL pour échanger le code contre un token
    oauth_scopes TEXT,                      -- Scopes par défaut (séparés par des espaces)
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des connexions clients
-- Stocke les credentials chiffrés pour chaque connexion client-service
CREATE TABLE client_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id),
    connection_name VARCHAR(255),           -- Nom donné par le client (ex: "Compte Gmail principal")
    
    -- Données chiffrées (seront chiffrées avant insertion)
    encrypted_access_token TEXT,            -- Token d'accès OAuth2
    encrypted_refresh_token TEXT,           -- Token de refresh OAuth2
    encrypted_api_key TEXT,                 -- Pour les services à clé API
    encrypted_secret TEXT,                  -- Tout autre secret nécessaire
    
    -- Métadonnées non sensibles
    token_expires_at TIMESTAMP,             -- Date d'expiration du token
    scopes TEXT[],                          -- Permissions accordées
    account_identifier VARCHAR(255),        -- Email/username du compte connecté
    
    -- Gestion et audit
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Version de la clé de chiffrement utilisée (pour la rotation)
    key_version INTEGER DEFAULT 1,
    
    -- Éviter les doublons
    UNIQUE(client_id, service_id, account_identifier)
);

-- Table pour la gestion des versions de clés de chiffrement
-- Permet la rotation sécurisée des clés
CREATE TABLE encryption_keys (
    version INTEGER PRIMARY KEY,
    key_hash VARCHAR(64) NOT NULL,         -- Hash SHA256 de la clé pour identification
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    retired_at TIMESTAMP,                   -- Date de mise hors service
    is_active BOOLEAN DEFAULT true
);

-- Table d'audit des accès aux credentials
-- Trace tous les accès pour la sécurité et la conformité
CREATE TABLE credential_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_connection_id UUID REFERENCES client_connections(id),
    accessed_by VARCHAR(100),               -- 'n8n', 'frontend', 'api', 'system'
    access_type VARCHAR(50),                -- 'read', 'refresh', 'revoke', 'create', 'update'
    ip_address INET,                        -- Adresse IP de l'accès
    user_agent TEXT,                        -- User agent si applicable
    success BOOLEAN DEFAULT true,           -- Si l'opération a réussi
    error_message TEXT,                     -- Message d'erreur si échec
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des erreurs de refresh token
-- Stocke les erreurs pour notification et debug
CREATE TABLE token_refresh_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_connection_id UUID REFERENCES client_connections(id),
    error_type VARCHAR(100),                -- 'invalid_refresh_token', 'service_unavailable', etc.
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP,
    resolved_at TIMESTAMP,                  -- Quand l'erreur a été résolue
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour les performances
CREATE INDEX idx_client_connections_client_service ON client_connections(client_id, service_id);
CREATE INDEX idx_client_connections_active ON client_connections(is_active) WHERE is_active = true;
CREATE INDEX idx_client_connections_expires ON client_connections(token_expires_at) WHERE is_active = true;
CREATE INDEX idx_credential_access_logs_connection ON credential_access_logs(client_connection_id);
CREATE INDEX idx_credential_access_logs_created ON credential_access_logs(created_at);
CREATE INDEX idx_token_refresh_errors_unresolved ON token_refresh_errors(client_connection_id) WHERE resolved_at IS NULL;

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers pour updated_at
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_connections_updated_at BEFORE UPDATE ON client_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Fonction de révocation de connexion
CREATE OR REPLACE FUNCTION revoke_client_connection(
    p_connection_id UUID,
    p_accessed_by VARCHAR(100) DEFAULT 'system',
    p_ip_address INET DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    -- Marquer la connexion comme inactive
    UPDATE client_connections 
    SET is_active = false
    WHERE id = p_connection_id;
    
    -- Logger l'action
    INSERT INTO credential_access_logs (
        client_connection_id, 
        accessed_by, 
        access_type, 
        ip_address
    )
    VALUES (
        p_connection_id, 
        p_accessed_by, 
        'revoke', 
        p_ip_address
    );
END;
$$ LANGUAGE plpgsql;

-- Insertion des services de base
INSERT INTO services (name, display_name, oauth_type, oauth_authorization_url, oauth_token_url, oauth_scopes) VALUES
('google', 'Google Workspace', 'oauth2', 
 'https://accounts.google.com/o/oauth2/v2/auth',
 'https://oauth2.googleapis.com/token',
 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.send'),
 
('microsoft', 'Microsoft 365', 'oauth2',
 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
 'User.Read Mail.Send Files.ReadWrite'),
 
('facebook', 'Facebook Business', 'oauth2',
 'https://www.facebook.com/v18.0/dialog/oauth',
 'https://graph.facebook.com/v18.0/oauth/access_token',
 'pages_show_list pages_read_engagement'),
 
('linkedin', 'LinkedIn', 'oauth2',
 'https://www.linkedin.com/oauth/v2/authorization',
 'https://www.linkedin.com/oauth/v2/accessToken',
 'r_liteprofile r_emailaddress w_member_social'),
 
('slack', 'Slack', 'oauth2',
 'https://slack.com/oauth/v2/authorize',
 'https://slack.com/api/oauth.v2.access',
 'chat:write channels:read'),
 
('openai', 'OpenAI', 'api_key', NULL, NULL, NULL),
('anthropic', 'Anthropic Claude', 'api_key', NULL, NULL, NULL),
('notion', 'Notion', 'api_key', NULL, NULL, NULL);

-- Vue pour faciliter la lecture des connexions actives
CREATE VIEW active_connections AS
SELECT 
    cc.id,
    c.email as client_email,
    c.company_name,
    s.display_name as service_name,
    cc.connection_name,
    cc.account_identifier,
    cc.token_expires_at,
    cc.last_used_at,
    cc.created_at
FROM client_connections cc
JOIN clients c ON cc.client_id = c.id
JOIN services s ON cc.service_id = s.id
WHERE cc.is_active = true
ORDER BY c.email, s.display_name;