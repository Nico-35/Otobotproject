// api-internal.js - API sécurisée pour N8N
const express = require('express');
const { Pool } = require('pg');
const { CredentialEncryption, CredentialManager } = require('./encryption');

// Initialisation Express
const app = express();
app.use(express.json());

// Configuration de la connexion PostgreSQL
const pool = new Pool({
    host: process.env.FRONTEND_DB_HOST,
    database: process.env.FRONTEND_DB_NAME,
    user: process.env.FRONTEND_DB_USER,
    password: process.env.FRONTEND_DB_PASSWORD,
    port: 5432,
});

// Initialisation du gestionnaire de chiffrement
const encryption = new CredentialEncryption();
const credentialManager = new CredentialManager(pool, encryption);

// Middleware d'authentification pour N8N
const authenticateN8N = (req, res, next) => {
    const internalToken = req.headers['x-internal-token'];
    
    if (!internalToken || internalToken !== process.env.N8N_INTERNAL_TOKEN) {
        return res.status(401).json({ 
            error: 'Unauthorized',
            message: 'Token interne invalide ou manquant'
        });
    }
    
    next();
};

// Middleware de logging des requêtes
const logRequest = (req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
};

// Application des middlewares globaux
app.use(logRequest);

// Route de santé (health check)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'otobot-internal-api',
        timestamp: new Date().toISOString()
    });
});

// ======================
// ROUTES POUR N8N
// ======================

/**
 * Récupère les credentials d'un client pour un service
 * GET /api/internal/credentials/:clientId/:serviceName
 */
app.get('/api/internal/credentials/:clientId/:serviceName', authenticateN8N, async (req, res) => {
    try {
        const { clientId, serviceName } = req.params;
        const ipAddress = req.ip;
        
        // Récupération de l'ID du service
        const serviceQuery = 'SELECT id FROM services WHERE name = $1 AND is_active = true';
        const serviceResult = await pool.query(serviceQuery, [serviceName]);
        
        if (serviceResult.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Service not found',
                message: `Le service ${serviceName} n'existe pas ou n'est pas actif`
            });
        }
        
        const serviceId = serviceResult.rows[0].id;
        
        // Récupération de la connexion
        const connection = await credentialManager.getConnection(clientId, serviceId);
        
        if (!connection) {
            return res.status(404).json({ 
                error: 'Connection not found',
                message: 'Aucune connexion active trouvée pour ce client et ce service'
            });
        }
        
        // Vérification de l'expiration du token
        const tokenExpired = connection.tokenExpiresAt && new Date(connection.tokenExpiresAt) < new Date();
        
        // Réponse avec les données nécessaires
        res.json({
            connectionId: connection.id,
            credentials: {
                accessToken: connection.accessToken,
                apiKey: connection.apiKey,
                // Ne pas renvoyer le refresh token à N8N
            },
            metadata: {
                accountIdentifier: connection.accountIdentifier,
                scopes: connection.scopes,
                tokenExpired: tokenExpired,
                tokenExpiresAt: connection.tokenExpiresAt
            }
        });
        
    } catch (error) {
        console.error('Erreur lors de la récupération des credentials:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: 'Une erreur est survenue lors de la récupération des credentials'
        });
    }
});

/**
 * Liste toutes les connexions disponibles pour un client
 * GET /api/internal/connections/:clientId
 */
app.get('/api/internal/connections/:clientId', authenticateN8N, async (req, res) => {
    try {
        const { clientId } = req.params;
        
        const query = `
            SELECT 
                cc.id,
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
            JOIN services s ON cc.service_id = s.id
            WHERE cc.client_id = $1 AND cc.is_active = true
            ORDER BY s.display_name, cc.created_at DESC
        `;
        
        const result = await pool.query(query, [clientId]);
        
        res.json({
            clientId: clientId,
            connections: result.rows
        });
        
    } catch (error) {
        console.error('Erreur lors de la liste des connexions:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: 'Une erreur est survenue lors de la récupération des connexions'
        });
    }
});

/**
 * Vérifie le statut d'une connexion
 * GET /api/internal/connection-status/:connectionId
 */
app.get('/api/internal/connection-status/:connectionId', authenticateN8N, async (req, res) => {
    try {
        const { connectionId } = req.params;
        
        const query = `
            SELECT 
                cc.id,
                cc.is_active,
                cc.token_expires_at,
                cc.last_used_at,
                s.name as service_name,
                CASE 
                    WHEN cc.token_expires_at IS NULL THEN 'valid'
                    WHEN cc.token_expires_at > NOW() THEN 'valid'
                    WHEN cc.encrypted_refresh_token IS NOT NULL THEN 'refresh_needed'
                    ELSE 'expired'
                END as status,
                (
                    SELECT COUNT(*) 
                    FROM token_refresh_errors 
                    WHERE client_connection_id = cc.id 
                    AND resolved_at IS NULL
                ) as error_count
            FROM client_connections cc
            JOIN services s ON cc.service_id = s.id
            WHERE cc.id = $1
        `;
        
        const result = await pool.query(query, [connectionId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Connection not found',
                message: 'Connexion introuvable'
            });
        }
        
        res.json(result.rows[0]);
        
    } catch (error) {
        console.error('Erreur lors de la vérification du statut:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: 'Une erreur est survenue lors de la vérification du statut'
        });
    }
});

// ======================
// ROUTES POUR LE REFRESH AUTOMATIQUE
// ======================

/**
 * Endpoint pour le refresh automatique des tokens
 * POST /api/internal/refresh-tokens
 */
app.post('/api/internal/refresh-tokens', authenticateN8N, async (req, res) => {
    try {
        // Récupération des connexions expirées
        const query = `
            SELECT 
                cc.id,
                cc.client_id,
                cc.service_id,
                s.name as service_name,
                s.oauth_token_url
            FROM client_connections cc
            JOIN services s ON cc.service_id = s.id
            WHERE cc.is_active = true
              AND cc.token_expires_at < NOW() + INTERVAL '1 hour'
              AND cc.encrypted_refresh_token IS NOT NULL
              AND s.oauth_type = 'oauth2'
        `;
        
        const expiredConnections = await pool.query(query);
        
        const results = [];
        
        for (const conn of expiredConnections.rows) {
            try {
                // Récupérer la connexion complète avec les tokens déchiffrés
                const connection = await credentialManager.getConnection(
                    conn.client_id, 
                    conn.service_id
                );
                
                if (!connection || !connection.refreshToken) {
                    continue;
                }
                
                // Appeler la fonction de refresh spécifique au service
                const refreshResult = await refreshServiceToken(
                    conn.service_name,
                    connection.refreshToken,
                    conn.oauth_token_url
                );
                
                // Mettre à jour les tokens
                await credentialManager.updateTokens(
                    conn.id,
                    refreshResult.access_token,
                    refreshResult.refresh_token,
                    new Date(Date.now() + refreshResult.expires_in * 1000)
                );
                
                results.push({
                    connectionId: conn.id,
                    status: 'success',
                    newExpiresAt: new Date(Date.now() + refreshResult.expires_in * 1000)
                });
                
            } catch (error) {
                // Logger l'erreur
                await pool.query(
                    'SELECT log_token_refresh_error($1, $2, $3)',
                    [conn.id, 'refresh_failed', error.message]
                );
                
                results.push({
                    connectionId: conn.id,
                    status: 'error',
                    error: error.message
                });
            }
        }
        
        res.json({
            processed: results.length,
            results: results
        });
        
    } catch (error) {
        console.error('Erreur lors du refresh des tokens:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: 'Une erreur est survenue lors du refresh des tokens'
        });
    }
});

// Fonction helper pour le refresh des tokens selon le service
async function refreshServiceToken(serviceName, refreshToken, tokenUrl) {
    // Cette fonction devrait être étendue pour chaque service
    // Exemple générique OAuth2
    const axios = require('axios');
    
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    
    // Vous devrez ajouter client_id et client_secret selon le service
    // Ces valeurs devraient être stockées de manière sécurisée
    
    const response = await axios.post(tokenUrl, params, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    
    return response.data;
}

// Gestion des erreurs globales
app.use((err, req, res, next) => {
    console.error('Erreur non gérée:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: 'Une erreur inattendue est survenue'
    });
});

// Démarrage du serveur
const PORT = process.env.INTERNAL_API_PORT || 3001;
// Intégration des endpoints ToolJet
const createToolJetEndpoints = require('./api-tooljet-endpoints');
const tooljetRouter = createToolJetEndpoints(pool, encryption, credentialManager);
app.use('/api/tooljet', tooljetRouter);
app.listen(PORT, () => {
    console.log(`API Interne démarrée sur le port ${PORT}`);
    console.log(`Environnement: ${process.env.NODE_ENV || 'development'}`);
});