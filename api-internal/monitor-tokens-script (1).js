// monitor-tokens.js - Script de monitoring des tokens
const { Pool } = require('pg');

// Configuration de la connexion
const pool = new Pool({
    host: process.env.FRONTEND_DB_HOST || 'localhost',
    database: process.env.FRONTEND_DB_NAME,
    user: process.env.FRONTEND_DB_USER,
    password: process.env.FRONTEND_DB_PASSWORD,
    port: 5432,
});

// Couleurs pour l'affichage console
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

async function monitorTokens() {
    console.log(`${colors.cyan}🔍 Monitoring des tokens - ${new Date().toLocaleString()}${colors.reset}\n`);
    
    try {
        // 1. Statistiques générales
        console.log(`${colors.blue}📊 Statistiques générales:${colors.reset}`);
        
        const statsQuery = `
            SELECT 
                COUNT(*) as total_connections,
                COUNT(CASE WHEN is_active = true THEN 1 END) as active_connections,
                COUNT(CASE WHEN token_expires_at < NOW() THEN 1 END) as expired_tokens,
                COUNT(CASE WHEN token_expires_at BETWEEN NOW() AND NOW() + INTERVAL '24 hours' THEN 1 END) as expiring_soon,
                COUNT(CASE WHEN encrypted_refresh_token IS NOT NULL THEN 1 END) as with_refresh_token
            FROM client_connections
        `;
        
        const stats = await pool.query(statsQuery);
        const s = stats.rows[0];
        
        console.log(`  Total connexions: ${s.total_connections}`);
        console.log(`  Connexions actives: ${colors.green}${s.active_connections}${colors.reset}`);
        console.log(`  Tokens expirés: ${colors.red}${s.expired_tokens}${colors.reset}`);
        console.log(`  Expirent dans 24h: ${colors.yellow}${s.expiring_soon}${colors.reset}`);
        console.log(`  Avec refresh token: ${s.with_refresh_token}`);
        
        // 2. Tokens expirés nécessitant attention
        console.log(`\n${colors.red}⚠️  Tokens expirés sans refresh token:${colors.reset}`);
        
        const expiredNoRefreshQuery = `
            SELECT 
                c.email as client_email,
                c.company_name,
                s.display_name as service,
                cc.connection_name,
                cc.token_expires_at,
                cc.last_used_at
            FROM client_connections cc
            JOIN clients c ON cc.client_id = c.id
            JOIN services s ON cc.service_id = s.id
            WHERE cc.is_active = true
              AND cc.token_expires_at < NOW()
              AND cc.encrypted_refresh_token IS NULL
            ORDER BY cc.token_expires_at ASC
            LIMIT 10
        `;
        
        const expiredNoRefresh = await pool.query(expiredNoRefreshQuery);
        
        if (expiredNoRefresh.rows.length === 0) {
            console.log(`  ${colors.green}✓ Aucun token expiré sans refresh token${colors.reset}`);
        } else {
            expiredNoRefresh.rows.forEach(row => {
                const expiredSince = Math.floor((Date.now() - new Date(row.token_expires_at)) / (1000 * 60 * 60 * 24));
                console.log(`  - ${row.client_email} (${row.company_name})`);
                console.log(`    Service: ${row.service} - "${row.connection_name}"`);
                console.log(`    Expiré depuis: ${colors.red}${expiredSince} jours${colors.reset}`);
                console.log(`    Dernière utilisation: ${row.last_used_at ? new Date(row.last_used_at).toLocaleString() : 'Jamais'}`);
            });
        }
        
        // 3. Tokens qui vont expirer bientôt
        console.log(`\n${colors.yellow}⏰ Tokens expirant dans les 7 prochains jours:${colors.reset}`);
        
        const expiringSoonQuery = `
            SELECT 
                c.email as client_email,
                s.display_name as service,
                cc.connection_name,
                cc.token_expires_at,
                cc.encrypted_refresh_token IS NOT NULL as has_refresh
            FROM client_connections cc
            JOIN clients c ON cc.client_id = c.id
            JOIN services s ON cc.service_id = s.id
            WHERE cc.is_active = true
              AND cc.token_expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
            ORDER BY cc.token_expires_at ASC
            LIMIT 10
        `;
        
        const expiringSoon = await pool.query(expiringSoonQuery);
        
        if (expiringSoon.rows.length === 0) {
            console.log(`  ${colors.green}✓ Aucun token n'expire dans les 7 prochains jours${colors.reset}`);
        } else {
            expiringSoon.rows.forEach(row => {
                const expiresIn = Math.floor((new Date(row.token_expires_at) - Date.now()) / (1000 * 60 * 60));
                const refreshStatus = row.has_refresh ? '✓ Refresh auto' : '✗ Intervention manuelle requise';
                console.log(`  - ${row.client_email} - ${row.service}`);
                console.log(`    "${row.connection_name}"`);
                console.log(`    Expire dans: ${colors.yellow}${expiresIn} heures${colors.reset}`);
                console.log(`    ${row.has_refresh ? colors.green : colors.red}${refreshStatus}${colors.reset}`);
            });
        }
        
        // 4. Erreurs de refresh récentes
        console.log(`\n${colors.red}❌ Erreurs de refresh récentes:${colors.reset}`);
        
        const errorsQuery = `
            SELECT 
                c.email as client_email,
                s.display_name as service,
                tre.error_type,
                tre.error_message,
                tre.retry_count,
                tre.created_at,
                tre.last_retry_at
            FROM token_refresh_errors tre
            JOIN client_connections cc ON tre.client_connection_id = cc.id
            JOIN clients c ON cc.client_id = c.id
            JOIN services s ON cc.service_id = s.id
            WHERE tre.resolved_at IS NULL
            ORDER BY tre.last_retry_at DESC NULLS LAST, tre.created_at DESC
            LIMIT 5
        `;
        
        const errors = await pool.query(errorsQuery);
        
        if (errors.rows.length === 0) {
            console.log(`  ${colors.green}✓ Aucune erreur de refresh non résolue${colors.reset}`);
        } else {
            errors.rows.forEach(row => {
                console.log(`  - ${row.client_email} - ${row.service}`);
                console.log(`    Type: ${colors.red}${row.error_type}${colors.reset}`);
                console.log(`    Message: ${row.error_message}`);
                console.log(`    Tentatives: ${row.retry_count}`);
                console.log(`    Première erreur: ${new Date(row.created_at).toLocaleString()}`);
                if (row.last_retry_at) {
                    console.log(`    Dernière tentative: ${new Date(row.last_retry_at).toLocaleString()}`);
                }
            });
        }
        
        // 5. Utilisation par service
        console.log(`\n${colors.blue}📈 Répartition par service:${colors.reset}`);
        
        const servicesQuery = `
            SELECT 
                s.display_name as service,
                COUNT(*) as total,
                COUNT(CASE WHEN cc.is_active = true THEN 1 END) as active,
                COUNT(CASE WHEN cc.token_expires_at < NOW() THEN 1 END) as expired,
                AVG(EXTRACT(EPOCH FROM (NOW() - cc.last_used_at)) / 86400)::INTEGER as avg_days_since_use
            FROM client_connections cc
            JOIN services s ON cc.service_id = s.id
            GROUP BY s.display_name
            ORDER BY total DESC
        `;
        
        const services = await pool.query(servicesQuery);
        
        services.rows.forEach(row => {
            const status = row.expired > 0 ? colors.red : colors.green;
            console.log(`  ${row.service}: ${row.total} connexions (${row.active} actives)`);
            if (row.expired > 0) {
                console.log(`    ${status}${row.expired} expirées${colors.reset}`);
            }
            if (row.avg_days_since_use !== null) {
                console.log(`    Utilisation moyenne: il y a ${row.avg_days_since_use} jours`);
            }
        });
        
        // 6. Alertes importantes
        console.log(`\n${colors.magenta}🚨 Alertes:${colors.reset}`);
        
        // Connexions jamais utilisées depuis plus de 30 jours
        const unusedQuery = `
            SELECT COUNT(*) as unused_count
            FROM client_connections
            WHERE is_active = true
              AND last_used_at IS NULL
              AND created_at < NOW() - INTERVAL '30 days'
        `;
        
        const unused = await pool.query(unusedQuery);
        
        if (unused.rows[0].unused_count > 0) {
            console.log(`  ${colors.yellow}⚠️  ${unused.rows[0].unused_count} connexions créées il y a plus de 30 jours jamais utilisées${colors.reset}`);
        }
        
        // Tokens qui échouent systématiquement au refresh
        const failingRefreshQuery = `
            SELECT COUNT(DISTINCT client_connection_id) as failing_count
            FROM token_refresh_errors
            WHERE retry_count > 5
              AND resolved_at IS NULL
        `;
        
        const failingRefresh = await pool.query(failingRefreshQuery);
        
        if (failingRefresh.rows[0].failing_count > 0) {
            console.log(`  ${colors.red}⚠️  ${failingRefresh.rows[0].failing_count} connexions échouent systématiquement au refresh (>5 tentatives)${colors.reset}`);
        }
        
        console.log(`\n${colors.cyan}✅ Monitoring terminé${colors.reset}\n`);
        
    } catch (error) {
        console.error(`${colors.red}Erreur lors du monitoring:${colors.reset}`, error.message);
    } finally {
        await pool.end();
    }
}

// Mode watch si demandé
const args = process.argv.slice(2);
if (args.includes('--watch')) {
    console.log(`${colors.cyan}Mode watch activé - Rafraîchissement toutes les 5 minutes${colors.reset}\n`);
    
    // Exécution immédiate
    monitorTokens();
    
    // Puis toutes les 5 minutes
    setInterval(() => {
        console.clear();
        monitorTokens();
    }, 5 * 60 * 1000);
} else {
    // Exécution unique
    monitorTokens();
}