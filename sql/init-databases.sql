-- =====================================================
-- SCRIPT D'INITIALISATION COMPLET OTOBOT
-- =====================================================
-- Ce script est exécuté automatiquement au premier lancement de PostgreSQL
-- Il crée toutes les bases et utilisateurs nécessaires

-- Création des utilisateurs et bases de données
-- Note: Les variables sont remplacées par Docker au démarrage

-- Base Frontend (déjà créée par le script create-frontend-database.sql si existant)
CREATE DATABASE otobot_frontend;
CREATE USER frontend_user WITH ENCRYPTED PASSWORD 'FRONTEND_DB_PASSWORD_PLACEHOLDER';
GRANT ALL PRIVILEGES ON DATABASE otobot_frontend TO frontend_user;

-- Base ToolJet
CREATE DATABASE otobot_tooljet;
CREATE USER tooljet_user WITH ENCRYPTED PASSWORD 'TOOLJET_DB_PASS_PLACEHOLDER';
GRANT ALL PRIVILEGES ON DATABASE otobot_tooljet TO tooljet_user;

-- Extension pgcrypto pour le chiffrement
\c otobot_frontend
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tables additionnelles pour la gestion client dans ToolJet
\c otobot_frontend

-- Table des sessions client (pour ToolJet)
CREATE TABLE IF NOT EXISTS client_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    tooljet_user_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);

-- Table des préférences utilisateur
CREATE TABLE IF NOT EXISTS client_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    preference_key VARCHAR(100) NOT NULL,
    preference_value JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, preference_key)
);

-- Table des services souscrits par client
CREATE TABLE IF NOT EXISTS client_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    service_code VARCHAR(50) NOT NULL,
    service_name VARCHAR(255) NOT NULL,
    description TEXT,
    config JSONB, -- Configuration spécifique du service
    is_active BOOLEAN DEFAULT true,
    subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP
);

-- Table pour les logs d'activité client
CREATE TABLE IF NOT EXISTS client_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50), -- 'workflow', 'connection', 'chatbot', etc.
    entity_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour les performances
CREATE INDEX idx_client_sessions_token ON client_sessions(session_token);
CREATE INDEX idx_client_sessions_expires ON client_sessions(expires_at);
CREATE INDEX idx_client_subscriptions_client ON client_subscriptions(client_id, is_active);
CREATE INDEX idx_client_activity_logs_client_date ON client_activity_logs(client_id, created_at DESC);

-- Fonction pour nettoyer les sessions expirées
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM client_sessions WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Vue pour le dashboard ToolJet
CREATE OR REPLACE VIEW v_client_dashboard AS
SELECT 
    c.id as client_id,
    c.email,
    c.company_name,
    COUNT(DISTINCT cs.id) as active_subscriptions,
    COUNT(DISTINCT cc.id) as total_connections,
    COUNT(DISTINCT CASE WHEN cc.token_expires_at > NOW() THEN cc.id END) as active_connections,
    COUNT(DISTINCT CASE WHEN cc.token_expires_at < NOW() THEN cc.id END) as expired_connections,
    MAX(cal.created_at) as last_activity
FROM clients c
LEFT JOIN client_subscriptions cs ON c.id = cs.client_id AND cs.is_active = true
LEFT JOIN client_connections cc ON c.id = cc.client_id
LEFT JOIN client_activity_logs cal ON c.id = cal.client_id
GROUP BY c.id, c.email, c.company_name;
