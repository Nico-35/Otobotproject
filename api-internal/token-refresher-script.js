// token-refresher.js - Script exécuté par cron pour rafraîchir les tokens
const axios = require('axios');

// Configuration depuis les variables d'environnement
const INTERNAL_API_URL = process.env.INTERNAL_API_URL || 'http://api-internal:3001';
const N8N_INTERNAL_TOKEN = process.env.N8N_INTERNAL_TOKEN;

async function refreshExpiredTokens() {
    console.log(`[${new Date().toISOString()}] Démarrage du refresh des tokens...`);
    
    try {
        // Appel à l'endpoint de refresh
        const response = await axios.post(
            `${INTERNAL_API_URL}/api/internal/refresh-tokens`,
            {},
            {
                headers: {
                    'x-internal-token': N8N_INTERNAL_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        const { processed, results } = response.data;
        
        console.log(`[${new Date().toISOString()}] Tokens traités: ${processed}`);
        
        // Log des résultats détaillés
        results.forEach(result => {
            if (result.status === 'success') {
                console.log(`✓ Connection ${result.connectionId} rafraîchie avec succès`);
            } else {
                console.error(`✗ Erreur pour connection ${result.connectionId}: ${result.error}`);
            }
        });
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Erreur lors du refresh:`, error.message);
        
        // Si l'API est down, logger mais ne pas crasher
        if (error.code === 'ECONNREFUSED') {
            console.error('L\'API interne semble être hors ligne');
        }
    }
}

// Exécution immédiate
refreshExpiredTokens()
    .then(() => {
        console.log(`[${new Date().toISOString()}] Refresh terminé`);
        process.exit(0);
    })
    .catch(error => {
        console.error('Erreur fatale:', error);
        process.exit(1);
    });