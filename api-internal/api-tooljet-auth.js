// api-tooljet-auth.js - Module d'authentification pour l'intégration ToolJet
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

/**
 * Module d'authentification pour ToolJet
 * Gère la connexion des clients et la génération de tokens JWT
 */
class ToolJetAuthModule {
    constructor(pool, jwtSecret) {
        this.pool = pool;
        this.jwtSecret = jwtSecret;
        this.sessionDuration = 24 * 60 * 60 * 1000; // 24 heures en millisecondes
    }

    /**
     * Authentifie un client avec email et mot de passe
     * @param {string} email - Email du client
     * @param {string} password - Mot de passe en clair
     * @returns {Object} Token JWT et informations client
     */
    async authenticateClient(email, password) {
        try {
            // Récupération du client
            const clientQuery = `
                SELECT 
                    c.id,
                    c.email,
                    c.company_name,
                    c.password_hash,
                    c.is_active,
                    c.last_login_at
                FROM clients c
                WHERE LOWER(c.email) = LOWER($1)
            `;
            
            const clientResult = await this.pool.query(clientQuery, [email]);
            
            if (clientResult.rows.length === 0) {
                throw new Error('Identifiants invalides');
            }
            
            const client = clientResult.rows[0];
            
            // Vérification du statut
            if (!client.is_active) {
                throw new Error('Compte désactivé');
            }
            
            // Vérification du mot de passe
            const passwordValid = await bcrypt.compare(password, client.password_hash);
            if (!passwordValid) {
                throw new Error('Identifiants invalides');
            }
            
            // Génération du token de session
            const sessionToken = this.generateSessionToken();
            const expiresAt = new Date(Date.now() + this.sessionDuration);
            
            // Création de la session
            await this.createSession(client.id, sessionToken, expiresAt);
            
            // Mise à jour de last_login_at
            await this.pool.query(
                'UPDATE clients SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
                [client.id]
            );
            
            // Génération du JWT
            const jwtToken = this.generateJWT(client);
            
            // Récupération des services souscrits
            const services = await this.getClientServices(client.id);
            
            return {
                success: true,
                token: jwtToken,
                sessionToken: sessionToken,
                client: {
                    id: client.id,
                    email: client.email,
                    companyName: client.company_name,
                    services: services
                },
                expiresAt: expiresAt
            };
            
        } catch (error) {
            console.error('Erreur authentification:', error);
            throw error;
        }
    }

    /**
     * Vérifie et rafraîchit une session existante
     * @param {string} sessionToken - Token de session
     * @returns {Object} Nouvelles informations de session
     */
    async verifySession(sessionToken) {
        try {
            const sessionQuery = `
                SELECT 
                    cs.*,
                    c.email,
                    c.company_name,
                    c.is_active
                FROM client_sessions cs
                JOIN clients c ON cs.client_id = c.id
                WHERE cs.session_token = $1
                AND cs.expires_at > CURRENT_TIMESTAMP
            `;
            
            const sessionResult = await this.pool.query(sessionQuery, [sessionToken]);
            
            if (sessionResult.rows.length === 0) {
                throw new Error('Session invalide ou expirée');
            }
            
            const session = sessionResult.rows[0];
            
            if (!session.is_active) {
                throw new Error('Compte désactivé');
            }
            
            // Mise à jour de l'activité
            await this.pool.query(
                'UPDATE client_sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = $1',
                [session.id]
            );
            
            // Génération d'un nouveau JWT
            const jwtToken = this.generateJWT({
                id: session.client_id,
                email: session.email,
                company_name: session.company_name
            });
            
            // Récupération des services
            const services = await this.getClientServices(session.client_id);
            
            return {
                success: true,
                token: jwtToken,
                client: {
                    id: session.client_id,
                    email: session.email,
                    companyName: session.company_name,
                    services: services
                }
            };
            
        } catch (error) {
            console.error('Erreur vérification session:', error);
            throw error;
        }
    }

    /**
     * Déconnecte un client
     * @param {string} sessionToken - Token de session à invalider
     */
    async logout(sessionToken) {
        try {
            await this.pool.query(
                'DELETE FROM client_sessions WHERE session_token = $1',
                [sessionToken]
            );
            
            return { success: true, message: 'Déconnexion réussie' };
        } catch (error) {
            console.error('Erreur logout:', error);
            throw error;
        }
    }

    /**
     * Crée une nouvelle session en base
     */
    async createSession(clientId, sessionToken, expiresAt, ipAddress = null, userAgent = null) {
        const query = `
            INSERT INTO client_sessions 
            (client_id, session_token, expires_at, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `;
        
        await this.pool.query(query, [
            clientId,
            sessionToken,
            expiresAt,
            ipAddress,
            userAgent
        ]);
    }

    /**
     * Récupère les services souscrits par un client
     */
    async getClientServices(clientId) {
        const query = `
            SELECT 
                service_code,
                service_name,
                description,
                config,
                is_active,
                subscribed_at,
                expires_at
            FROM client_subscriptions
            WHERE client_id = $1 AND is_active = true
            ORDER BY service_name
        `;
        
        const result = await this.pool.query(query, [clientId]);
        return result.rows;
    }

    /**
     * Génère un token de session unique
     */
    generateSessionToken() {
        return uuidv4() + '-' + Date.now();
    }

    /**
     * Génère un JWT pour un client
     */
    generateJWT(client) {
        const payload = {
            clientId: client.id,
            email: client.email,
            companyName: client.company_name || client.company_name,
            type: 'client_access'
        };
        
        return jwt.sign(payload, this.jwtSecret, {
            expiresIn: '24h',
            issuer: 'otobot-api'
        });
    }

    /**
     * Vérifie un JWT
     */
    verifyJWT(token) {
        try {
            return jwt.verify(token, this.jwtSecret, {
                issuer: 'otobot-api'
            });
        } catch (error) {
            throw new Error('Token JWT invalide');
        }
    }

    /**
     * Enregistre une activité client
     */
    async logActivity(clientId, action, entityType = null, entityId = null, details = null, ipAddress = null) {
        const query = `
            INSERT INTO client_activity_logs 
            (client_id, action, entity_type, entity_id, details, ip_address)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        
        await this.pool.query(query, [
            clientId,
            action,
            entityType,
            entityId,
            details ? JSON.stringify(details) : null,
            ipAddress
        ]);
    }

    /**
     * Change le mot de passe d'un client
     */
    async changePassword(clientId, oldPassword, newPassword) {
        try {
            // Vérifier l'ancien mot de passe
            const clientQuery = 'SELECT password_hash FROM clients WHERE id = $1';
            const clientResult = await this.pool.query(clientQuery, [clientId]);
            
            if (clientResult.rows.length === 0) {
                throw new Error('Client non trouvé');
            }
            
            const passwordValid = await bcrypt.compare(oldPassword, clientResult.rows[0].password_hash);
            if (!passwordValid) {
                throw new Error('Mot de passe actuel incorrect');
            }
            
            // Hasher le nouveau mot de passe
            const newHash = await bcrypt.hash(newPassword, 10);
            
            // Mettre à jour
            await this.pool.query(
                'UPDATE clients SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [newHash, clientId]
            );
            
            // Invalider toutes les sessions existantes
            await this.pool.query(
                'DELETE FROM client_sessions WHERE client_id = $1',
                [clientId]
            );
            
            return { success: true, message: 'Mot de passe modifié avec succès' };
            
        } catch (error) {
            console.error('Erreur changement mot de passe:', error);
            throw error;
        }
    }

    /**
     * Nettoie les sessions expirées
     */
    async cleanupExpiredSessions() {
        try {
            const result = await this.pool.query(
                'DELETE FROM client_sessions WHERE expires_at < CURRENT_TIMESTAMP'
            );
            
            console.log(`Sessions expirées supprimées: ${result.rowCount}`);
        } catch (error) {
            console.error('Erreur nettoyage sessions:', error);
        }
    }
}

module.exports = ToolJetAuthModule;
