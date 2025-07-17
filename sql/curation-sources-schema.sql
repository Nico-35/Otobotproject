-- =====================================================
-- SCHEMA POUR LES SOURCES DE CURATION DE CONTENU
-- =====================================================
-- Ce script crée la structure nécessaire pour stocker
-- les sources de veille configurées par chaque utilisateur

-- Type énuméré pour catégoriser les sources
-- Garantit l'intégrité des données en limitant les valeurs possibles
CREATE TYPE source_type_enum AS ENUM (
    'WEBSITE',          -- Sites web à scraper
    'RSS_FEED',         -- Flux RSS
    'SOCIAL_ACCOUNT',   -- Comptes de réseaux sociaux
    'BLOG'              -- Blogs spécifiques
);

-- Table principale pour stocker les sources de curation
CREATE TABLE curation_sources (
    -- Identifiant unique non-séquentiel
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Lien vers l'utilisateur propriétaire (multi-tenant)
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Type de source utilisant l'ENUM pour validation
    source_type source_type_enum NOT NULL,
    
    -- Valeur de la source (URL, identifiant social, etc.)
    source_value TEXT NOT NULL,
    
    -- Nom personnalisé optionnel pour identifier facilement la source
    source_name VARCHAR(255),
    
    -- Métadonnées additionnelles (ex: paramètres de scraping)
    metadata JSONB DEFAULT '{}',
    
    -- Active/Inactive sans suppression
    is_active BOOLEAN DEFAULT true,
    
    -- Tracking de la dernière vérification
    last_checked_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Éviter les doublons pour un même utilisateur
    CONSTRAINT unique_user_source UNIQUE(user_id, source_type, source_value)
);

-- Index pour optimiser les requêtes
CREATE INDEX idx_curation_sources_user_id ON curation_sources(user_id);
CREATE INDEX idx_curation_sources_active ON curation_sources(is_active) WHERE is_active = true;
CREATE INDEX idx_curation_sources_type ON curation_sources(source_type);

-- Trigger pour mise à jour automatique du timestamp
CREATE TRIGGER update_curation_sources_updated_at 
BEFORE UPDATE ON curation_sources
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Commentaires pour documentation
COMMENT ON TABLE curation_sources IS 'Stocke les sources de curation configurées par chaque utilisateur pour la veille automatisée';
COMMENT ON COLUMN curation_sources.metadata IS 'Données JSON pour paramètres spécifiques (ex: sélecteurs CSS, options de scraping)';