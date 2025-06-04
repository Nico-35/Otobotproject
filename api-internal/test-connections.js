// test-connections.js - Script pour tester le système de credentials
const axios = require('axios');
const { Pool } = require('pg');
const { CredentialEncryption, CredentialManager } = require('./encryption');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3001';
const N8N_TOKEN = process.env.N8N_INTERNAL_TOKEN;

// Tests à exécuter
async function runTests() {
    console.log('🧪 Démarrage des tests du système de credentials...\n');
    
    // Test 1: Vérification de la santé de l'API
    console.log('📋 Test 1: Health Check');
    try {
        const health = await axios.get(`${API_URL}/health`);
        console.log('✅ API en ligne:', health.data);
    } catch (error) {
        console.error('❌ Erreur health check:', error.message);
        return;
    }
    
    // Test 2: Test d'authentification
    console.log('\n📋 Test 2: Authentification');
    try {
        // Sans token
        await axios.get(`${API_URL}/api/internal/connections/test-client-id`);
        console.error('❌ L\'API accepte les requêtes sans token!');
    } catch (error) {
        if (error.response?.status === 401) {
            console.log('✅ Rejet correct des requêtes sans token');
        } else {
            console.error('❌ Erreur inattendue:', error.message);
        }
    }
    
    // Test 3: Test avec token valide
    console.log('\n📋 Test 3: Requête avec token valide');
    const authHeaders = {
        headers: { 'x-internal-token': N8N_TOKEN }
    };
    
    try {
        const response = await axios.get(
            `${API_URL}/api/internal/connections/550e8400-e29b-41d4-a716-446655440000`,
            authHeaders
        );
        console.log('✅ Requête autorisée, connexions:', response.data.connections.length);
    } catch (error) {
        if (error.response?.status === 404) {
            console.log('✅ Réponse 404 correcte pour client inexistant');
        } else {
            console.error('❌ Erreur:', error.response?.data || error.message);
        }
    }
    
    // Test 4: Test de chiffrement/déchiffrement
    console.log('\n📋 Test 4: Chiffrement/Déchiffrement');
    try {
        const encryption = new CredentialEncryption();
        const testData = 'sk-test-1234567890abcdef';
        
        const encrypted = encryption.encrypt(testData);
        console.log('🔐 Données chiffrées:', encrypted);
        
        const decrypted = encryption.decrypt(encrypted);
        console.log('🔓 Données déchiffrées:', decrypted);
        
        if (decrypted === testData) {
            console.log('✅ Chiffrement/déchiffrement fonctionnel');
        } else {
            console.error('❌ Les données déchiffrées ne correspondent pas');
        }
    } catch (error) {
        console.error('❌ Erreur de chiffrement:', error.message);
    }
    
    // Test 5: Test de validation des paramètres
    console.log('\n📋 Test 5: Validation des paramètres');
    try {
        // UUID invalide
        await axios.get(
            `${API_URL}/api/internal/credentials/invalid-uuid/google`,
            authHeaders
        );
        console.error('❌ L\'API accepte des UUID invalides');
    } catch (error) {
        if (error.response?.status === 400) {
            console.log('✅ Validation UUID correcte');
        }
    }
    
    try {
        // Service invalide
        await axios.get(
            `${API_URL}/api/internal/credentials/550e8400-e29b-41d4-a716-446655440000/invalid-service`,
            authHeaders
        );
        console.error('❌ L\'API accepte des services invalides');
    } catch (error) {
        if (error.response?.status === 400) {
            console.log('✅ Validation service correcte');
        }
    }
    
    console.log('\n✨ Tests terminés!');
}

// Script d'insertion de données de test
async function insertTestData() {
    console.log('\n📝 Insertion de données de test...');
    
    const pool = new Pool({
        host: process.env.FRONTEND_DB_HOST || 'localhost',
        database: process.env.FRONTEND_DB_NAME,
        user: process.env.FRONTEND_DB_USER,
        password: process.env.FRONTEND_DB_PASSWORD,
        port: 5432,
    });
    
    const encryption = new CredentialEncryption();
    const credentialManager = new CredentialManager(pool, encryption);
    
    try {
        // Créer un client de test
        const clientResult = await pool.query(`
            INSERT INTO clients (email, company_name)
            VALUES ('test@otobot.fr', 'Entreprise Test')
            ON CONFLICT (email) DO UPDATE 
            SET company_name = EXCLUDED.company_name
            RETURNING id
        `);
        
        const clientId = clientResult.rows[0].id;
        console.log('Client test créé:', clientId);
        
        // Ajouter une connexion Google
        const connectionId = await credentialManager.storeConnection({
            clientId: clientId,
            serviceId: 1, // Google
            connectionName: 'Compte Gmail principal',
            accessToken: 'ya29.test_access_token_google',
            refreshToken: '1//test_refresh_token_google',
            tokenExpiresAt: new Date(Date.now() + 3600000), // Expire dans 1h
            scopes: ['https://www.googleapis.com/auth/gmail.send'],
            accountIdentifier: 'test@gmail.com'
        });
        
        console.log('✅ Connexion test créée:', connectionId);
        
        // Ajouter une connexion API Key (OpenAI)
        const apiKeyConnection = await credentialManager.storeConnection({
            clientId: clientId,
            serviceId: 6, // OpenAI
            connectionName: 'Clé API OpenAI',
            apiKey: 'sk-test-1234567890abcdef',
            accountIdentifier: 'org-testorg123'
        });
        
        console.log('✅ Connexion API Key créée:', apiKeyConnection);
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'insertion:', error.message);
    } finally {
        await pool.end();
    }
}

// Exécution selon les arguments
const args = process.argv.slice(2);

if (args.includes('--insert-test-data')) {
    insertTestData().then(() => runTests());
} else {
    runTests();
}