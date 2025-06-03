// encryption.js - Module de chiffrement pour les credentials
const crypto = require('crypto');

class CredentialEncryption {
    constructor() {
        // L'algorithme de chiffrement utilisé
        this.algorithm = 'aes-256-gcm';
        
        // Récupération de la clé maître depuis l'environnement
        // IMPORTANT : Cette clé doit être de 32 bytes (256 bits)
        this.masterKey = Buffer.from(process.env.ENCRYPTION_MASTER_KEY, 'hex');
        
        // Vérification de la longueur de la clé
        if (this.masterKey.length !== 32) {
            throw new Error('La clé de chiffrement doit faire exactement 32 bytes (64 caractères hex)');
        }
    }

    /**
     * Génère une nouvelle clé de chiffrement
     * À utiliser lors de l'installation initiale
     */
    static generateKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Chiffre une donnée sensible
     * @param {string} text - Le texte à chiffrer (token, clé API, etc.)
     * @returns {object} - Objet contenant les données chiffrées
     */
    encrypt(text) {
        try {
            // Génération d'un vecteur d'initialisation unique pour chaque chiffrement
            const iv = crypto.randomBytes(16);
            
            // Création du cipher
            const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);
            
            // Chiffrement du texte
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Récupération du tag d'authentification (pour vérifier l'intégrité)
            const authTag = cipher.getAuthTag();
            
            // Retour d'un objet avec toutes les données nécessaires au déchiffrement
            return {
                encrypted: encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                version: 1 // Version de la clé utilisée
            };
        } catch (error) {
            throw new Error(`Erreur lors du chiffrement : ${error.message}`);
        }
    }

    /**
     * Déchiffre une donnée
     * @param {object} encryptedData - L'objet retourné par encrypt()
     * @returns {string} - Le texte déchiffré
     */
    decrypt(encryptedData) {
        try {
            // Reconstruction des buffers depuis les chaînes hex
            const iv = Buffer.from(encryptedData.iv, 'hex');
            const authTag = Buffer.from(encryptedData.authTag, 'hex');
            
            // Création du decipher
            const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv);
            decipher.setAuthTag(authTag);
            
            // Déchiffrement
            let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error(`Erreur lors du déchiffrement : ${error.message}`);
        }
    }

    /**
     * Formate les données chiffrées pour stockage en base
     * @param {object} encryptedData - L'objet retourné par encrypt()
     * @returns {string} - Chaîne formatée pour stockage
     */
    formatForStorage(encryptedData) {
        // Format : version:iv:authTag:encrypted
        return `${encryptedData.version}:${encryptedData.iv}:${encryptedData.authTag}:${encryptedData.encrypted}`;
    }

    /**
     * Parse les données stockées en base
     * @param {string} storedData - La chaîne stockée en base
     * @returns {object} - L'objet pour decrypt()
     */
    parseFromStorage(storedData) {
        const parts = storedData.split(':');
        if (parts.length !== 4) {
            throw new Error('Format de données chiffrées invalide');
        }
        
        return {
            version: parseInt(parts[0]),
            iv: parts[1],
            authTag: parts[2],
            encrypted: parts[3]
        };
    }

    /**
     * Hash une clé pour stockage sécurisé (pour la table encryption_keys)
     * @param {string} key - La clé à hasher
     * @returns {string} - Le hash SHA256
     */
    static hashKey(key) {
        return crypto.createHash('sha256').update(key).digest('hex');
    }
}

// Classe pour gérer les connexions à la base de données
class CredentialManager {
    constructor(db, encryption) {
        this.db = db; // Instance de connexion PostgreSQL (pg)
        this.encryption = encryption;
    }

    /**
     * Stocke une nouvelle connexion client
     * @param {object} connectionData - Les données de connexion
     */
    async storeConnection(connectionData) {
        const {
            clientId,
            serviceId,
            connectionName,
            accessToken,
            refreshToken,
            apiKey,
            secret,
            tokenExpiresAt,
            scopes,
            accountIdentifier
        } = connectionData;

        try {
            // Chiffrement des données sensibles
            const encryptedData = {};
            
            if (accessToken) {
                const encrypted = this.encryption.encrypt(accessToken);
                encryptedData.encrypted_access_token = this.encryption.formatForStorage(encrypted);
            }
            
            if (refreshToken) {
                const encrypted = this.encryption.encrypt(refreshToken);
                encryptedData.encrypted_refresh_token = this.encryption.formatForStorage(encrypted);
            }
            
            if (apiKey) {
                const encrypted = this.encryption.encrypt(apiKey);
                encryptedData.encrypted_api_key = this.encryption.formatForStorage(encrypted);
            }
            
            if (secret) {
                const encrypted = this.encryption.encrypt(secret);
                encryptedData.encrypted_secret = this.encryption.formatForStorage(encrypted);
            }

            // Insertion en base
            const query = `
                INSERT INTO client_connections (
                    client_id, service_id, connection_name,
                    encrypted_access_token, encrypted_refresh_token,
                    encrypted_api_key, encrypted_secret,
                    token_expires_at, scopes, account_identifier,
                    key_version
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id
            `;

            const values = [
                clientId,
                serviceId,
                connectionName,
                encryptedData.encrypted_access_token || null,
                encryptedData.encrypted_refresh_token || null,
                encryptedData.encrypted_api_key || null,
                encryptedData.encrypted_secret || null,
                tokenExpiresAt || null,
                scopes || null,
                accountIdentifier || null,
                1 // Version de clé actuelle
            ];

            const result = await this.db.query(query, values);
            
            // Log de l'action
            await this.logAccess(result.rows[0].id, 'create', 'api');
            
            return result.rows[0].id;
        } catch (error) {
            throw new Error(`Erreur lors du stockage de la connexion : ${error.message}`);
        }
    }

    /**
     * Récupère et déchiffre une connexion
     * @param {string} clientId - ID du client
     * @param {number} serviceId - ID du service
     */
    async getConnection(clientId, serviceId) {
        try {
            const query = `
                SELECT * FROM client_connections
                WHERE client_id = $1 AND service_id = $2 AND is_active = true
                ORDER BY created_at DESC
                LIMIT 1
            `;

            const result = await this.db.query(query, [clientId, serviceId]);
            
            if (result.rows.length === 0) {
                return null;
            }

            const connection = result.rows[0];
            
            // Déchiffrement des données
            const decrypted = {};
            
            if (connection.encrypted_access_token) {
                const parsed = this.encryption.parseFromStorage(connection.encrypted_access_token);
                decrypted.accessToken = this.encryption.decrypt(parsed);
            }
            
            if (connection.encrypted_refresh_token) {
                const parsed = this.encryption.parseFromStorage(connection.encrypted_refresh_token);
                decrypted.refreshToken = this.encryption.decrypt(parsed);
            }
            
            if (connection.encrypted_api_key) {
                const parsed = this.encryption.parseFromStorage(connection.encrypted_api_key);
                decrypted.apiKey = this.encryption.decrypt(parsed);
            }

            // Log de l'accès
            await this.logAccess(connection.id, 'read', 'api');
            
            // Mise à jour de last_used_at
            await this.db.query(
                'UPDATE client_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
                [connection.id]
            );

            return {
                id: connection.id,
                connectionName: connection.connection_name,
                accountIdentifier: connection.account_identifier,
                tokenExpiresAt: connection.token_expires_at,
                scopes: connection.scopes,
                ...decrypted
            };
        } catch (error) {
            throw new Error(`Erreur lors de la récupération de la connexion : ${error.message}`);
        }
    }

    /**
     * Met à jour les tokens d'une connexion (après refresh)
     */
    async updateTokens(connectionId, newAccessToken, newRefreshToken, expiresAt) {
        try {
            const updates = {};
            
            if (newAccessToken) {
                const encrypted = this.encryption.encrypt(newAccessToken);
                updates.encrypted_access_token = this.encryption.formatForStorage(encrypted);
            }
            
            if (newRefreshToken) {
                const encrypted = this.encryption.encrypt(newRefreshToken);
                updates.encrypted_refresh_token = this.encryption.formatForStorage(encrypted);
            }

            const query = `
                UPDATE client_connections
                SET encrypted_access_token = $1,
                    encrypted_refresh_token = $2,
                    token_expires_at = $3,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
            `;

            await this.db.query(query, [
                updates.encrypted_access_token || null,
                updates.encrypted_refresh_token || null,
                expiresAt,
                connectionId
            ]);

            await this.logAccess(connectionId, 'refresh', 'system');
        } catch (error) {
            throw new Error(`Erreur lors de la mise à jour des tokens : ${error.message}`);
        }
    }

    /**
     * Enregistre un accès dans les logs
     */
    async logAccess(connectionId, accessType, accessedBy, ipAddress = null) {
        const query = `
            INSERT INTO credential_access_logs (
                client_connection_id, accessed_by, access_type, ip_address
            ) VALUES ($1, $2, $3, $4)
        `;

        await this.db.query(query, [connectionId, accessedBy, accessType, ipAddress]);
    }
}

// Export des classes
module.exports = {
    CredentialEncryption,
    CredentialManager
};

// Script d'initialisation pour générer une clé
if (require.main === module) {
    console.log('Génération d'une nouvelle clé de chiffrement...');
    console.log('Ajoutez cette ligne à votre fichier .env :');
    console.log(`ENCRYPTION_MASTER_KEY=${CredentialEncryption.generateKey()}`);
}