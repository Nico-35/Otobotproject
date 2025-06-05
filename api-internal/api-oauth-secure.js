// api-oauth-secure.js - Module OAuth avec stockage sécurisé en BDD
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

/**
 * Module OAuth sécurisé qui récupère les credentials depuis la BDD
 * au lieu du fichier .env
 */
class SecureOAuthManager {
    constructor(pool, encryption) {
        this.pool = pool;
        this.encryption = encryption;
        
        // Table temporaire pour stocker les états OAuth (en mémoire)
        this.oauthStates = new Map();
        
        // Timer pour nettoyer les états expirés
        setInterval(() => this.cleanupExpiredStates(), 5 * 60 * 1000);
    }
    
    /**
     * Récupère les credentials OAuth depuis la base de données
     * @param {string} userId - ID de l'utilisateur
     * @param {string} serviceName - Nom du service (notion, google, etc.)
     */
    async getOAuthConfig(userId, serviceName) {
        try {
            // Utiliser la fonction PostgreSQL pour récupérer les credentials
            const query = 'SELECT * FROM get_oauth_credentials($1, $2, $3)';
            const result = await this.pool.query(query, [
                userId,
                serviceName,
                process.env.ENCRYPTION_MASTER_KEY
            ]);
            
            if (result.rows.length === 0) {
                throw new Error(`Aucune configuration OAuth trouvée pour ${serviceName}`);
            }
            
            const config = result.rows[0];
            
            // Construire l'objet de configuration
            return {
                appId: config.app_id,
                appName: config.app_name,
                clientId: config.client_id,
                clientSecret: config.client_secret,
                redirectUri: config.redirect_uri,
                scopes: config.scopes || [],
                appType: config.app_type, // 'global', 'client', ou 'custom'
                // URLs OAuth standards par service
                authorizationUrl: this.getAuthorizationUrl(serviceName),
                tokenUrl: this.getTokenUrl(serviceName)
            };
            
        } catch (error) {
            console.error(`Erreur récupération config OAuth:`, error);
            throw error;
        }
    }
    
    /**
     * Retourne l'URL d'autorisation OAuth selon le service
     */
    getAuthorizationUrl(serviceName) {
        const urls = {
            notion: 'https://api.notion.com/v1/oauth/authorize',
            google: 'https://accounts.google.com/o/oauth2/v2/auth',
            microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            slack: 'https://slack.com/oauth/v2/authorize',
            linkedin: 'https://www.linkedin.com/oauth/v2/authorization',
            facebook: 'https://www.facebook.com/v18.0/dialog/oauth'
        };
        return urls[serviceName] || null;
    }
    
    /**
     * Retourne l'URL d'échange de token selon le service
     */
    getTokenUrl(serviceName) {
        const urls = {
            notion: 'https://api.notion.com/v1/oauth/token',
            google: 'https://oauth2.googleapis.com/token',
            microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            slack: 'https://slack.com/api/oauth.v2.access',
            linkedin: 'https://www.linkedin.com/oauth/v2/accessToken',
            facebook: 'https://graph.facebook.com/v18.0/oauth/access_token'
        };
        return urls[serviceName] || null;
    }
    
    /**
     * Génère l'URL d'autorisation OAuth
     */
    async generateAuthorizationUrl(serviceName, userId, returnUrl) {
        // Récupérer la configuration depuis la BDD
        const config = await this.getOAuthConfig(userId, serviceName);
        
        // Générer un état unique
        const state = uuidv4();
        
        // Stocker l'état avec les infos nécessaires
        this.oauthStates.set(state, {
            userId,
            serviceName,
            returnUrl,
            oauthAppId: config.appId, // Stocker l'ID de l'app OAuth utilisée
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
        });
        
        // Construire l'URL d'autorisation
        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            response_type: 'code',
            scope: Array.isArray(config.scopes) ? config.scopes.join(' ') : config.scopes,
            state: state
        });
        
        // Paramètres spécifiques par service
        if (serviceName === 'google') {
            params.append('access_type', 'offline');
            params.append('prompt', 'consent');
        } else if (serviceName === 'notion') {
            params.append('owner', 'user');
        }
        
        // Logger l'utilisation
        await this.logOAuthUsage(config.appId, userId, 'authorize', true);
        
        return {
            authUrl: `${config.authorizationUrl}?${params.toString()}`,
            state: state,
            appType: config.appType
        };
    }
    
    /**
     * Traite le callback OAuth
     */
    async handleOAuthCallback(serviceName, code, state) {
        // Vérifier l'état
        const stateData = this.oauthStates.get(state);
        
        if (!stateData) {
            throw new Error('État OAuth invalide ou expiré');
        }
        
        // Vérifier l'expiration
        if (new Date() > stateData.expiresAt) {
            this.oauthStates.delete(state);
            throw new Error('État OAuth expiré');
        }
        
        // Vérifier la cohérence du service
        if (stateData.serviceName !== serviceName) {
            throw new Error('Service OAuth incohérent');
        }
        
        const userId = stateData.userId;
        
        try {
            // Récupérer la configuration
            const config = await this.getOAuthConfig(userId, serviceName);
            
            // Échanger le code contre les tokens
            const tokenResponse = await this.exchangeCodeForTokens(
                serviceName, 
                code, 
                config
            );
            
            // Récupérer les informations du compte
            const accountInfo = await this.getAccountInfo(
                serviceName, 
                tokenResponse.access_token
            );
            
            // Stocker la connexion avec l'app OAuth utilisée
            const connectionData = {
                userId: userId,
                serviceName: serviceName,
                oauthAppId: stateData.oauthAppId,
                connectionName: `${accountInfo.displayName || accountInfo.email} - ${serviceName}`,
                accessToken: tokenResponse.access_token,
                refreshToken: tokenResponse.refresh_token,
                tokenExpiresAt: tokenResponse.expires_in ? 
                    new Date(Date.now() + tokenResponse.expires_in * 1000) : null,
                scopes: config.scopes,
                accountIdentifier: accountInfo.email || accountInfo.id
            };
            
            // Stocker en base avec la nouvelle colonne oauth_app_id
            const connectionId = await this.storeConnection(connectionData);
            
            // Logger le succès
            await this.logOAuthUsage(
                stateData.oauthAppId, 
                userId, 
                'token_exchange', 
                true
            );
            
            // Nettoyer l'état
            this.oauthStates.delete(state);

            return {
                success: true,
                connectionId: connectionId,
                returnUrl: stateData.returnUrl,
                accountInfo: accountInfo
            };
            
        } catch (error) {
            // Logger l'échec
            await this.logOAuthUsage(
                stateData.oauthAppId, 
                userId, 
                'token_exchange', 
                false,
                error.message
            );
            
            // Nettoyer l'état
            this.oauthStates.delete(state);
            throw error;
        }
    }
    
    /**
     * Stocke une connexion OAuth en base
     */
    async storeConnection(connectionData) {
        
        // Récupérer l'ID du service
        const serviceQuery = 'SELECT id FROM services WHERE name = $1';
        const serviceResult = await this.pool.query(serviceQuery, [connectionData.serviceName]);
        
        if (serviceResult.rows.length === 0) {
            throw new Error(`Service ${connectionData.serviceName} non trouvé`);
        }
        
        const serviceId = serviceResult.rows[0].id;
        
        // Gérer les valeurs spécifiques selon le service
        // Notion ne fournit pas de refresh_token ni d'expiration
        const hasRefreshToken = connectionData.refreshToken !== null && connectionData.refreshToken !== undefined;
        const hasExpiration = connectionData.tokenExpiresAt !== null && connectionData.tokenExpiresAt !== undefined;
        
        // Utiliser la fonction PL/pgSQL existante qui gère le chiffrement
        // ATTENTION : La fonction n'a pas de paramètre oauth_app_id
        const query = `
            SELECT store_user_connection(
                $1::UUID,  -- p_user_id
                $2::INTEGER,  -- p_service_id
                $3::VARCHAR,  -- p_connection_name (SANS oauth_app_id)
                $4::TEXT,  -- p_access_token
                $5::TEXT,  -- p_refresh_token
                $6::TEXT,  -- p_api_key (NULL pour OAuth)
                $7::TEXT,  -- p_secret (NULL pour OAuth)
                $8::TIMESTAMP,  -- p_token_expires_at
                $9::TEXT[],  -- p_scopes (array)
                $10::VARCHAR,  -- p_account_identifier
                $11::TEXT  -- p_master_key
            ) as connection_id
        `;
        
        // Préparer les scopes comme array PostgreSQL
        const scopesArray = Array.isArray(connectionData.scopes) 
            ? connectionData.scopes 
            : (connectionData.scopes ? connectionData.scopes.split(' ') : []);
        
        const queryParams = [
            connectionData.userId,                    // $1
            serviceId,                                // $2
            connectionData.connectionName,            // $3 (PAS oauth_app_id ici)
            connectionData.accessToken,               // $4
            hasRefreshToken ? connectionData.refreshToken : null,  // $5
            null,  // $6 - api_key (NULL pour OAuth)
            null,  // $7 - secret (NULL pour OAuth)
            hasExpiration ? connectionData.tokenExpiresAt : null,  // $8
            scopesArray,                              // $9
            connectionData.accountIdentifier || null, // $10
            process.env.ENCRYPTION_MASTER_KEY         // $11
        ];
        
        try {

            
            const result = await this.pool.query(query, queryParams);
            
            if (result.rows.length === 0) {
                throw new Error('La fonction store_user_connection n\'a pas retourné d\'ID');
            }
            
            const connectionId = result.rows[0].connection_id;
            console.log('✅ Connexion créée avec succès, ID:', connectionId);
            
            // IMPORTANT : Mettre à jour la connexion avec oauth_app_id après création
            if (connectionData.oauthAppId) {

                await this.pool.query(
                    'UPDATE client_connections SET oauth_app_id = $1 WHERE id = $2',
                    [connectionData.oauthAppId, connectionId]
                );
                
                // Logger l'utilisation de l'app OAuth
                await this.pool.query(
                    'INSERT INTO oauth_app_usage_logs (oauth_app_id, user_id, action) VALUES ($1, $2, $3)',
                    [connectionData.oauthAppId, connectionData.userId, 'connection_created']
                );
            }
            
            // Logger l'activité
            await this.pool.query(
                'INSERT INTO client_activity_logs (client_id, user_id, action, entity_type, entity_id, details) ' +
                'SELECT client_id, $1, $2, $3, $4, $5 FROM users WHERE id = $1',
                [
                    connectionData.userId,
                    'oauth_connection_created',
                    'connection',
                    connectionId,
                    JSON.stringify({
                        service: connectionData.serviceName,
                        account: connectionData.accountIdentifier,
                        hasRefreshToken: hasRefreshToken,
                        hasExpiration: hasExpiration
                    })
                ]
            );
            
            return connectionId;
            
        } catch (error) {
            console.error('❌ ERROR storeConnection:', error);
            console.error('ERROR - Query:', query);
            console.error('ERROR - Service:', connectionData.serviceName);
            console.error('ERROR - User ID:', connectionData.userId);
            console.error('ERROR - Params count:', queryParams.length);
            
            throw error;
        }
    }
 
    
    /**
     * Échange le code contre les tokens
     */
    async exchangeCodeForTokens(serviceName, code, config) {
    // Configuration spéciale pour Notion qui nécessite Basic Auth
    if (serviceName === 'notion') {
        const authString = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
        
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: config.redirectUri
        });
        
        try {
            const response = await axios.post(config.tokenUrl, params, {
                headers: {
                    'Authorization': `Basic ${authString}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                }
            });
            
            return response.data;
        } catch (error) {
            console.error(`Erreur échange token ${serviceName}:`, error.response?.data);
            throw new Error(`Impossible d'obtenir les tokens: ${error.message}`);
        }
    }
    
    // Code original pour les autres services
    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret
    });
    
    try {
        const response = await axios.post(config.tokenUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        });
        
        return response.data;
        
    } catch (error) {
        console.error(`Erreur échange token ${serviceName}:`, error.response?.data);
        throw new Error(`Impossible d'obtenir les tokens: ${error.message}`);
    }
}
    
    /**
     * Récupère les informations du compte
     */
    async getAccountInfo(serviceName, accessToken) {
        const handlers = {
            notion: () => this.getNotionUserInfo(accessToken),
            google: () => this.getGoogleUserInfo(accessToken),
            microsoft: () => this.getMicrosoftUserInfo(accessToken),
            slack: () => this.getSlackUserInfo(accessToken),
            linkedin: () => this.getLinkedInUserInfo(accessToken),
            facebook: () => this.getFacebookUserInfo(accessToken)
        };
        
        const handler = handlers[serviceName];
        if (!handler) {
            return { id: 'unknown', email: 'unknown' };
        }
        
        return await handler();
    }
    
    // Méthodes pour récupérer les infos de chaque service
    async getNotionUserInfo(accessToken) {
        try {
            const response = await axios.get('https://api.notion.com/v1/users/me', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Notion-Version': '2022-06-28'
                }
            });
            
            return {
                id: response.data.id,
                email: response.data.person?.email || response.data.bot?.owner?.user?.person?.email,
                displayName: response.data.name
            };
        } catch (error) {
            console.error('Erreur Notion user info:', error);
            return { id: 'unknown', email: 'unknown' };
        }
    }
    
    async getGoogleUserInfo(accessToken) {
        try {
            const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            return {
                id: response.data.id,
                email: response.data.email,
                displayName: response.data.name
            };
        } catch (error) {
            console.error('Erreur Google user info:', error);
            return { id: 'unknown', email: 'unknown' };
        }
    }
    
    async getMicrosoftUserInfo(accessToken) {
        try {
            const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            return {
                id: response.data.id,
                email: response.data.mail || response.data.userPrincipalName,
                displayName: response.data.displayName
            };
        } catch (error) {
            console.error('Erreur Microsoft user info:', error);
            return { id: 'unknown', email: 'unknown' };
        }
    }
    
    async getSlackUserInfo(accessToken) {
        try {
            const response = await axios.get('https://slack.com/api/users.identity', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            return {
                id: response.data.user?.id,
                email: response.data.user?.email,
                displayName: response.data.user?.name
            };
        } catch (error) {
            console.error('Erreur Slack user info:', error);
            return { id: 'unknown', email: 'unknown' };
        }
    }
    
    async getLinkedInUserInfo(accessToken) {
        try {
            const response = await axios.get('https://api.linkedin.com/v2/me', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            return {
                id: response.data.id,
                email: 'linkedin@user', // LinkedIn nécessite un endpoint séparé pour l'email
                displayName: `${response.data.localizedFirstName} ${response.data.localizedLastName}`
            };
        } catch (error) {
            console.error('Erreur LinkedIn user info:', error);
            return { id: 'unknown', email: 'unknown' };
        }
    }
    
    async getFacebookUserInfo(accessToken) {
        try {
            const response = await axios.get('https://graph.facebook.com/me?fields=id,name,email', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            return {
                id: response.data.id,
                email: response.data.email,
                displayName: response.data.name
            };
        } catch (error) {
            console.error('Erreur Facebook user info:', error);
            return { id: 'unknown', email: 'unknown' };
        }
    }
    
    /**
     * Log l'utilisation d'une app OAuth
     */
    async logOAuthUsage(oauthAppId, userId, action, success, errorMessage = null) {
        try {
            await this.pool.query(
                `INSERT INTO oauth_app_usage_logs 
                 (oauth_app_id, user_id, action, success, error_message, ip_address) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [oauthAppId, userId, action, success, errorMessage, null]
            );
        } catch (error) {
            console.error('Erreur log OAuth usage:', error);
        }
    }
    
    /**
     * Nettoie les états expirés
     */
    cleanupExpiredStates() {
        const now = new Date();
        for (const [state, data] of this.oauthStates.entries()) {
            if (now > data.expiresAt) {
                this.oauthStates.delete(state);
            }
        }
    }
}

/**
 * Crée les routes OAuth sécurisées
 */
function createSecureOAuthRoutes(pool, encryption) {
    const oauthManager = new SecureOAuthManager(pool, encryption);
    
    /**
     * GET /api/oauth/connect/:service
     * Initie la connexion OAuth
     */
    router.get('/connect/:service', async (req, res) => {
        try {
            const { service } = req.params;
            const { userId, returnUrl } = req.query;
            
            if (!userId) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'userId requis'
                });
            }
            
            // Générer l'URL d'autorisation
            const { authUrl, state, appType } = await oauthManager.generateAuthorizationUrl(
                service,
                userId,
                returnUrl || '/connections'
            );
            
            // Rediriger vers le provider OAuth
            res.redirect(authUrl);
            
        } catch (error) {
            console.error('Erreur initiation OAuth:', error);
            
            // Rediriger vers ToolJet avec l'erreur
            const errorUrl = `${process.env.TOOLJET_URL}/connections?error=${encodeURIComponent(error.message)}`;
            res.redirect(errorUrl);
        }
    });
    
    /**
     * GET /api/oauth/callback/:service
     * Callback OAuth
     */
    router.get('/callback/:service', async (req, res) => {
        try {
            const { service } = req.params;
            const { code, state, error: oauthError } = req.query;
            
            // Vérifier si le provider a renvoyé une erreur
            if (oauthError) {
                console.error(`Erreur OAuth ${service}:`, oauthError);
                return res.redirect(
                    `${process.env.TOOLJET_URL}/connections?error=${oauthError}`
                );
            }
            
            if (!code || !state) {
                return res.status(400).send('Code ou state manquant');
            }
            
            // Traiter le callback
            const result = await oauthManager.handleOAuthCallback(service, code, state);
            
            // Rediriger vers ToolJet avec succès
            const baseUrl = result.returnUrl.startsWith('http') ? '' : process.env.TOOLJET_URL;
            const successUrl = `${baseUrl}${result.returnUrl}?success=true&service=${service}&account=${encodeURIComponent(result.accountInfo.email || '')}`;
 
            res.redirect(successUrl);
            
        } catch (error) {
            console.error('Erreur callback OAuth:', error);
            res.redirect(
                `${process.env.TOOLJET_URL}/connections?error=${encodeURIComponent(error.message)}`
            );
        }
    });
    
    /**
     * POST /api/oauth/app
     * Créer ou mettre à jour une app OAuth (admin only)
     */
    router.post('/app', async (req, res) => {
        try {
            const {
                clientId, // ID du client (null pour app globale)
                serviceName,
                appName,
                oauthClientId,
                oauthClientSecret,
                redirectUri,
                scopes,
                userId // User qui crée l'app
            } = req.body;
            
            // Valider les données
            if (!serviceName || !appName || !oauthClientId || !oauthClientSecret) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Données manquantes'
                });
            }
            
            // Utiliser la fonction PostgreSQL pour créer/mettre à jour
            const query = 'SELECT upsert_oauth_application($1, $2, $3, $4, $5, $6, $7, $8, $9)';
            const result = await pool.query(query, [
                clientId,
                serviceName,
                appName,
                oauthClientId,
                oauthClientSecret,
                redirectUri,
                scopes || [],
                userId,
                process.env.ENCRYPTION_MASTER_KEY
            ]);
            
            res.json({
                success: true,
                appId: result.rows[0].upsert_oauth_application
            });
            
        } catch (error) {
            console.error('Erreur création app OAuth:', error);
            res.status(500).json({
                error: 'Internal Server Error',
                message: error.message
            });
        }
    });
    
    /**
     * GET /api/oauth/apps
     * Liste les apps OAuth disponibles
     */
    router.get('/apps', async (req, res) => {
        try {
            const { clientId } = req.query;
            
            let query = 'SELECT * FROM v_oauth_applications WHERE is_active = true';
            const params = [];
            
            if (clientId) {
                query += ' AND (client_id = $1 OR is_global = true)';
                params.push(clientId);
            }
            
            query += ' ORDER BY is_global DESC, service_name';
            
            const result = await pool.query(query, params);
            
            res.json({
                success: true,
                apps: result.rows
            });
            
        } catch (error) {
            console.error('Erreur liste apps OAuth:', error);
            res.status(500).json({
                error: 'Internal Server Error',
                message: error.message
            });
        }
    });
    
    return router;
}

module.exports = { SecureOAuthManager, createSecureOAuthRoutes };