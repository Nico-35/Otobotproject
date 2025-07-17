// api-tooljet-endpoints.js - Endpoints spécifiques pour l'intégration ToolJet
const express = require('express');
const router = express.Router();
const ToolJetAuthModule = require('./api-tooljet-auth');

/**
 * Module d'endpoints pour ToolJet
 * Fournit toutes les routes nécessaires au frontend
 */
function createToolJetEndpoints(pool, encryption, credentialManager) {
    // Initialisation du module d'authentification
    const authModule = new ToolJetAuthModule(pool, process.env.API_JWT_SECRET);
    
    // Middleware d'authentification pour ToolJet
// Modification pour api-tooljet-endpoints.js
// Remplacer le middleware authenticateToolJet existant par cette version flexible

// Middleware d'authentification flexible pour ToolJet
const authenticateToolJet = async (req, res, next) => {
    try {
        // Option 1 : Token JWT Bearer (pour les vrais utilisateurs)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            try {
                const decoded = authModule.verifyJWT(token);
                
                // Récupérer l'ID de l'utilisateur depuis le token ou la base
                let userId = decoded.userId; // Si le JWT contient userId
                
                if (!userId && decoded.clientId) {
                    // Si pas de userId dans le token, récupérer depuis la base
                    const userQuery = `
                        SELECT id FROM users 
                        WHERE client_id = $1 AND email = $2 
                        LIMIT 1
                    `;
                    const userResult = await pool.query(userQuery, [decoded.clientId, decoded.email]);
                    
                    if (userResult.rows.length > 0) {
                        userId = userResult.rows[0].id;
                    }
                }
                
                // Ajouter les infos à la requête
                req.client = {
                    id: decoded.clientId,
                    email: decoded.email,
                    companyName: decoded.companyName
                };
                
                req.user = {
                    id: userId,
                    email: decoded.email
                };
                
                return next();
            } catch (jwtError) {
                // JWT invalide, essayer l'autre méthode
            }
        }
        
        // Option 2 : x-internal-token (pour compatibilité)
        const internalToken = req.headers['x-internal-token'];
        if (internalToken && internalToken === process.env.N8N_INTERNAL_TOKEN) {
            // Pour le token interne, on doit récupérer userId depuis la query
            const userId = req.query.userId || req.body.userId;
            const clientId = req.query.clientId || req.body.clientId;
            
            if (!userId) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'userId requis pour x-internal-token'
                });
            }
            
            // Récupérer les infos depuis la DB
            const userQuery = `
                SELECT u.id, u.email, u.client_id, c.email as client_email, c.company_name
                FROM users u
                JOIN clients c ON u.client_id = c.id
                WHERE u.id = $1
            `;
            const userResult = await pool.query(userQuery, [userId]);
            
            if (userResult.rows.length > 0) {
                const user = userResult.rows[0];
                req.client = {
                    id: user.client_id,
                    email: user.client_email,
                    companyName: user.company_name
                };
                req.user = {
                    id: user.id,
                    email: user.email
                };
            } else {
                return res.status(404).json({
                    error: 'Not Found',
                    message: 'Utilisateur introuvable'
                });
            }
            
            return next();
        }
        
        // Aucune authentification valide trouvée
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Token manquant ou invalide'
        });
        
    } catch (error) {
        console.error('Erreur authentification ToolJet:', error);
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Erreur d\'authentification'
        });
    }
};    
    // ======================
    // ENDPOINTS D'AUTHENTIFICATION
    // ======================
    
    /**
     * POST /api/tooljet/auth/login
     * Connexion d'un client
     */
    router.post('/auth/login', async (req, res) => {
        try {
            const { email, password } = req.body;
            
            if (!email || !password) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Email et mot de passe requis'
                });
            }
            
            const result = await authModule.authenticateClient(email, password);
            
            // Log de l'activité
            await authModule.logActivity(
                result.client.id,
                'login',
                'authentication',
                null,
                { method: 'password' },
                req.ip
            );
            
            res.json(result);
            
        } catch (error) {
            console.error('Erreur login:', error);
            res.status(401).json({
                error: 'Authentication failed',
                message: error.message
            });
        }
    });
    
    /**
     * POST /api/tooljet/auth/verify
     * Vérification d'une session
     */
    router.post('/auth/verify', async (req, res) => {
        try {
            const { sessionToken } = req.body;
            
            if (!sessionToken) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Token de session requis'
                });
            }
            
            const result = await authModule.verifySession(sessionToken);
            res.json(result);
            
        } catch (error) {
            res.status(401).json({
                error: 'Invalid session',
                message: error.message
            });
        }
    });
    
    /**
     * POST /api/tooljet/auth/logout
     * Déconnexion
     */
    router.post('/auth/logout', authenticateToolJet, async (req, res) => {
        try {
            const { sessionToken } = req.body;
            
            await authModule.logout(sessionToken);
            
            // Log de l'activité
            await authModule.logActivity(
                req.client.id,
                'logout',
                'authentication',
                null,
                null,
                req.ip
            );
            
            res.json({ success: true, message: 'Déconnexion réussie' });
            
        } catch (error) {
            res.status(500).json({
                error: 'Logout failed',
                message: error.message
            });
        }
    });
    
    // ======================
    // ENDPOINTS DASHBOARD
    // ======================
    
    /**
     * GET /api/tooljet/dashboard
     * Données du dashboard principal
     */
    router.get('/dashboard', authenticateToolJet, async (req, res) => {
        try {
            const dashboardQuery = `
                SELECT 
                    COUNT(DISTINCT cs.id) as active_services,
                    COUNT(DISTINCT cc.id) FILTER (WHERE cc.is_active = true) as total_connections,
                    COUNT(DISTINCT cc.id) FILTER (WHERE cc.token_expires_at > NOW()) as active_connections,
                    COUNT(DISTINCT cc.id) FILTER (WHERE cc.token_expires_at < NOW()) as expired_connections,
                    COUNT(DISTINCT cc.id) FILTER (WHERE cc.token_expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days') as expiring_soon,
                    (
                        SELECT json_agg(recent_activity)
                        FROM (
                            SELECT 
                                action,
                                entity_type,
                                created_at,
                                details
                            FROM client_activity_logs
                            WHERE client_id = $1
                            ORDER BY created_at DESC
                            LIMIT 10
                        ) recent_activity
                    ) as recent_activities
                FROM clients c
                LEFT JOIN client_subscriptions cs ON c.id = cs.client_id AND cs.is_active = true
                LEFT JOIN client_connections cc ON c.id = cc.client_id
                WHERE c.id = $1
                GROUP BY c.id
            `;
            
            const result = await pool.query(dashboardQuery, [req.client.id]);
            
            res.json({
                success: true,
                dashboard: result.rows[0]
            });
            
        } catch (error) {
            console.error('Erreur dashboard:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Erreur lors de la récupération du dashboard'
            });
        }
    });
    
    // ======================
    // ENDPOINTS CONNEXIONS
    // ======================
    
    /**
     * GET /api/tooljet/connections
     * Liste toutes les connexions du client
     */
    router.get('/connections', authenticateToolJet, async (req, res) => {
        try {
            const query = `
                SELECT 
                    cc.id,
                    s.name as service_name,
                    s.display_name as service_display_name,
                    cc.connection_name,
                    cc.account_identifier,
                    cc.token_expires_at,
                    cc.last_used_at,
                    cc.created_at,
                    cc.is_active,
                    CASE 
                        WHEN cc.token_expires_at IS NULL THEN 'valid'
                        WHEN cc.token_expires_at > NOW() THEN 'valid'
                        WHEN cc.encrypted_refresh_token IS NOT NULL THEN 'refresh_needed'
                        ELSE 'expired'
                    END as status,
                    CASE 
                        WHEN cc.token_expires_at IS NOT NULL 
                        THEN EXTRACT(EPOCH FROM (cc.token_expires_at - NOW()))
                        ELSE NULL 
                    END as expires_in_seconds
                FROM client_connections cc
                JOIN services s ON cc.service_id = s.id
                WHERE cc.client_id = $1
                ORDER BY cc.is_active DESC, s.display_name, cc.created_at DESC
            `;
            
            const result = await pool.query(query, [req.client.id]);
            
            res.json({
                success: true,
                connections: result.rows
            });
            
        } catch (error) {
            console.error('Erreur liste connexions:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Erreur lors de la récupération des connexions'
            });
        }
    });
    
    /**
     * POST /api/tooljet/connections/test
     * Teste une connexion
     */
    router.post('/connections/test', authenticateToolJet, async (req, res) => {
        try {
            const { connectionId } = req.body;
            
            // Vérifier que la connexion appartient au client
            const checkQuery = `
                SELECT cc.*, s.name as service_name
                FROM client_connections cc
                JOIN services s ON cc.service_id = s.id
                WHERE cc.id = $1 AND cc.client_id = $2
            `;
            
            const checkResult = await pool.query(checkQuery, [connectionId, req.client.id]);
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Not found',
                    message: 'Connexion introuvable'
                });
            }
            
            const connection = checkResult.rows[0];
            
            // Test basique : vérifier si le token est expiré
            let testResult = {
                success: true,
                status: 'active',
                message: 'Connexion active'
            };
            
            if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
                testResult = {
                    success: false,
                    status: 'expired',
                    message: 'Token expiré'
                };
            }
            
            // Log de l'activité
            await authModule.logActivity(
                req.client.id,
                'test_connection',
                'connection',
                connectionId,
                { service: connection.service_name, result: testResult.status },
                req.ip
            );
            
            res.json(testResult);
            
        } catch (error) {
            console.error('Erreur test connexion:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Erreur lors du test de connexion'
            });
        }
    });
    
    /**
     * DELETE /api/tooljet/connections/:id
     * Supprime une connexion
     */
    router.delete('/connections/:id', authenticateToolJet, async (req, res) => {
        try {
            const { id } = req.params;
            
            // Vérifier que la connexion appartient au client
            const result = await pool.query(
                'UPDATE client_connections SET is_active = false WHERE id = $1 AND client_id = $2 RETURNING id',
                [id, req.client.id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Not found',
                    message: 'Connexion introuvable'
                });
            }
            
            // Log de l'activité
            await authModule.logActivity(
                req.client.id,
                'delete_connection',
                'connection',
                id,
                null,
                req.ip
            );
            
            res.json({
                success: true,
                message: 'Connexion supprimée'
            });
            
        } catch (error) {
            console.error('Erreur suppression connexion:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Erreur lors de la suppression'
            });
        }
    });
    
    // ======================
    // ENDPOINTS SERVICES
    // ======================
    
    /**
     * GET /api/tooljet/services
     * Liste les services souscrits
     */
    router.get('/services', authenticateToolJet, async (req, res) => {
        try {
            const services = await authModule.getClientServices(req.client.id);
            
            res.json({
                success: true,
                services: services
            });
            
        } catch (error) {
            console.error('Erreur liste services:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Erreur lors de la récupération des services'
            });
        }
    });
    
    /**
     * POST /api/tooljet/services/:serviceCode/trigger
     * Déclenche un service (workflow N8N)
     */
    router.post('/services/:serviceCode/trigger', authenticateToolJet, async (req, res) => {
        try {
            const { serviceCode } = req.params;
            const { parameters } = req.body;
            
            // Vérifier que le client a souscrit à ce service
            const serviceQuery = `
                SELECT * FROM client_subscriptions 
                WHERE client_id = $1 AND service_code = $2 AND is_active = true
            `;
            
            const serviceResult = await pool.query(serviceQuery, [req.client.id, serviceCode]);
            
            if (serviceResult.rows.length === 0) {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Service non souscrit'
                });
            }
            
            // TODO: Implémenter le déclenchement du workflow N8N
            // Pour l'instant, on simule
            
            // Log de l'activité
            await authModule.logActivity(
                req.client.id,
                'trigger_service',
                'service',
                serviceCode,
                { parameters },
                req.ip
            );
            
            res.json({
                success: true,
                message: 'Service déclenché',
                executionId: 'exec_' + Date.now()
            });
            
        } catch (error) {
            console.error('Erreur déclenchement service:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Erreur lors du déclenchement'
            });
        }
    });
    
    // ======================
    // ENDPOINTS PROFIL
    // ======================
    
    /**
     * GET /api/tooljet/profile
     * Récupère le profil du client
     */
    router.get('/profile', authenticateToolJet, async (req, res) => {
        try {
            const query = `
                SELECT 
                    id,
                    email,
                    company_name,
                    created_at,
                    last_login_at
                FROM clients
                WHERE id = $1
            `;
            
            const result = await pool.query(query, [req.client.id]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Not found',
                    message: 'Client introuvable'
                });
            }
            
            res.json({
                success: true,
                profile: result.rows[0]
            });
            
        } catch (error) {
            console.error('Erreur profil:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Erreur lors de la récupération du profil'
            });
        }
    });
    
    /**
     * PUT /api/tooljet/profile
     * Met à jour le profil
     */
    router.put('/profile', authenticateToolJet, async (req, res) => {
        try {
            const { company_name } = req.body;
            
            if (company_name) {
                await pool.query(
                    'UPDATE clients SET company_name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                    [company_name, req.client.id]
                );
            }
            
            // Log de l'activité
            await authModule.logActivity(
                req.client.id,
                'update_profile',
                'profile',
                null,
                { fields: Object.keys(req.body) },
                req.ip
            );
            
            res.json({
                success: true,
                message: 'Profil mis à jour'
            });
            
        } catch (error) {
            console.error('Erreur mise à jour profil:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Erreur lors de la mise à jour'
            });
        }
    });
    
    /**
     * POST /api/tooljet/profile/change-password
     * Change le mot de passe
     */
    router.post('/profile/change-password', authenticateToolJet, async (req, res) => {
        try {
            const { oldPassword, newPassword } = req.body;
            
            if (!oldPassword || !newPassword) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Ancien et nouveau mot de passe requis'
                });
            }
            
            if (newPassword.length < 8) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Le nouveau mot de passe doit faire au moins 8 caractères'
                });
            }
            
            const result = await authModule.changePassword(
                req.client.id,
                oldPassword,
                newPassword
            );
            
            res.json(result);
            
        } catch (error) {
            console.error('Erreur changement mot de passe:', error);
            res.status(400).json({
                error: 'Password change failed',
                message: error.message
            });
        }
    });
    
    // ======================
    // ENDPOINTS ACTIVITÉS
    // ======================
    
    /**
     * GET /api/tooljet/activities
     * Récupère l'historique des activités
     */
    router.get('/activities', authenticateToolJet, async (req, res) => {
        try {
            const { limit = 50, offset = 0 } = req.query;
            
            const query = `
                SELECT 
                    id,
                    action,
                    entity_type,
                    entity_id,
                    details,
                    ip_address,
                    created_at
                FROM client_activity_logs
                WHERE client_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
            `;
            
            const result = await pool.query(query, [req.client.id, limit, offset]);
            
            // Compter le total
            const countResult = await pool.query(
                'SELECT COUNT(*) FROM client_activity_logs WHERE client_id = $1',
                [req.client.id]
            );
            
            res.json({
                success: true,
                activities: result.rows,
                total: parseInt(countResult.rows[0].count),
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
            
        } catch (error) {
            console.error('Erreur activités:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Erreur lors de la récupération des activités'
            });
        }
    });
    
    // Nettoyage périodique des sessions expirées
    setInterval(() => {
        authModule.cleanupExpiredSessions();
    }, 60 * 60 * 1000); // Toutes les heures
    

    // ======================
    // ENDPOINTS CURATION DE CONTENU
    // ======================
    
    /**
     * GET /api/tooljet/curation-sources
     * Liste toutes les sources de curation de l'utilisateur
     */
    router.get('/curation-sources', authenticateToolJet, async (req, res) => {
        try {
            const query = `
                SELECT 
                    id,
                    source_type,
                    source_value,
                    source_name,
                    metadata,
                    is_active,
                    last_checked_at,
                    created_at,
                    updated_at
                FROM curation_sources
                WHERE user_id = $1
                ORDER BY created_at DESC
            `;
            
            const result = await pool.query(query, [req.client.id]);
            
            res.json({
                success: true,
                sources: result.rows
            });
            
        } catch (error) {
            console.error('Erreur liste sources curation:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Erreur lors de la récupération des sources'
            });
        }
    });
    
    /**
     * POST /api/tooljet/curation-sources
     * Ajoute une nouvelle source de curation
     */
    router.post('/curation-sources', authenticateToolJet, async (req, res) => {
        try {
            const { source_type, source_value, source_name, metadata } = req.body;
            
            // Validation des données
            if (!source_type || !source_value) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'source_type et source_value sont requis'
                });
            }
            
            // Validation du type
            const validTypes = ['WEBSITE', 'RSS_FEED', 'SOCIAL_ACCOUNT', 'BLOG'];
            if (!validTypes.includes(source_type)) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: `source_type doit être l'un de: ${validTypes.join(', ')}`
                });
            }
            
            const query = `
                INSERT INTO curation_sources 
                (user_id, source_type, source_value, source_name, metadata)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;
            
            const result = await pool.query(query, [
                req.client.id,
                source_type,
                source_value,
                source_name || null,
                metadata || {}
            ]);
            
            // Log de l'activité
            await authModule.logActivity(
                req.client.id,
                'add_curation_source',
                'curation_source',
                result.rows[0].id,
                { source_type, source_value },
                req.ip
            );
            
            res.status(201).json({
                success: true,
                source: result.rows[0]
            });
            
        } catch (error) {
            console.error('Erreur ajout source curation:', error);
            
            // Gestion de l'erreur de doublon
            if (error.code === '23505') {
                return res.status(409).json({
                    error: 'Conflict',
                    message: 'Cette source existe déjà pour cet utilisateur'
                });
            }
            
            res.status(500).json({
                error: 'Internal server error',
                message: 'Erreur lors de l\'ajout de la source'
            });
        }
    });
    
    /**
     * PUT /api/tooljet/curation-sources/:id
     * Met à jour une source de curation
     */
    router.put('/curation-sources/:id', authenticateToolJet, async (req, res) => {
        try {
            const { id } = req.params;
            const { source_value, source_name, metadata, is_active } = req.body;
            
            // Construction dynamique de la requête UPDATE
            const updates = [];
            const values = [id, req.client.id];
            let paramIndex = 3;
            
            if (source_value !== undefined) {
                updates.push(`source_value = $${paramIndex++}`);
                values.push(source_value);
            }
            
            if (source_name !== undefined) {
                updates.push(`source_name = $${paramIndex++}`);
                values.push(source_name);
            }
            
            if (metadata !== undefined) {
                updates.push(`metadata = $${paramIndex++}`);
                values.push(metadata);
            }
            
            if (is_active !== undefined) {
                updates.push(`is_active = $${paramIndex++}`);
                values.push(is_active);
            }
            
            if (updates.length === 0) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Aucune donnée à mettre à jour'
                });
            }
            
            const query = `
                UPDATE curation_sources
                SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND user_id = $2
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Not found',
                    message: 'Source introuvable ou non autorisée'
                });
            }
            
            // Log de l'activité
            await authModule.logActivity(
                req.client.id,
                'update_curation_source',
                'curation_source',
                id,
                { updates: updates.join(', ') },
                req.ip
            );
            
            res.json({
                success: true,
                source: result.rows[0]
            });
            
        } catch (error) {
            console.error('Erreur mise à jour source curation:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Erreur lors de la mise à jour de la source'
            });
        }
    });
    
    /**
     * DELETE /api/tooljet/curation-sources/:id
     * Supprime une source de curation
     */
    router.delete('/curation-sources/:id', authenticateToolJet, async (req, res) => {
        try {
            const { id } = req.params;
            
            const query = `
                DELETE FROM curation_sources
                WHERE id = $1 AND user_id = $2
                RETURNING id
            `;
            
            const result = await pool.query(query, [id, req.client.id]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Not found',
                    message: 'Source introuvable ou non autorisée'
                });
            }
            
            // Log de l'activité
            await authModule.logActivity(
                req.client.id,
                'delete_curation_source',
                'curation_source',
                id,
                null,
                req.ip
            );
            
            res.status(204).send();
            
        } catch (error) {
            console.error('Erreur suppression source curation:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Erreur lors de la suppression de la source'
            });
        }
    });


    return router;
}

module.exports = createToolJetEndpoints;
