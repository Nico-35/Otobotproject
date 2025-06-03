// api-internal-secure.js - Version améliorée avec sécurité renforcée
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const { CredentialEncryption, CredentialManager } = require('./encryption');

// Chargement des variables d'environnement en développement
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

// Initialisation Express
const app = express();

// =======================
// MIDDLEWARES DE SÉCURITÉ
// =======================

// Helmet pour les headers de sécurité
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// CORS - Limiter aux origines autorisées
const corsOptions = {
    origin: function (origin, callback) {
        // Autoriser les requêtes sans origine (ex: Postman, requêtes serveur-à-serveur)
        if (!origin) return callback(null, true);
        
        // Liste des origines autorisées (à adapter selon vos besoins)
        const allowedOrigins = [
            'http://n8n:5678',          // N8N interne
            'http://localhost:5678',     // N8N local pour dev
            process.env.N8N_HOST         // N8N production
        ].filter(Boolean);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Non autorisé par CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting global
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limite de 100 requêtes par fenêtre
    message: 'Trop de requêtes, veuillez réessayer plus tard',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(globalLimiter);

// Rate limiting strict pour les endpoints sensibles
const strictLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // Seulement 10 requêtes toutes les 5 minutes
    skipSuccessfulRequests: false,
});

// Body parser avec limite de taille
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// =======================
// CONFIGURATION BASE DE DONNÉES
// =======================

// Pool de connexions avec configuration optimisée
const pool = new Pool({
    host: process.env.FRONTEND_DB_HOST,
    database: process.env.FRONTEND_DB_NAME,
    user: process.env.FRONTEND_DB_USER,
    password: process.env.FRONTEND_DB_PASSWORD,
    port: 5432,
    max: 20,                    // Maximum de connexions dans le pool
    idleTimeoutMillis: 30000,   // Timeout pour les connexions inactives
    connectionTimeoutMillis: 2000, // Timeout de connexion
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test de connexion au démarrage
pool.connect((err, client, release) => {
    if (err) {
        console.error('Erreur de connexion à la base de données:', err.stack);
        process.exit(1);
    } else {
        console.log('Connexion à la base de données établie');
        release();
    }
});

// Initialisation du gestionnaire de chiffrement
let encryption;
let credentialManager;

try {
    encryption = new CredentialEncryption();
    credentialManager = new CredentialManager(pool, encryption);
} catch (error) {
    console.error('Erreur lors de l\'initialisation du chiffrement:', error.message);
    console.error('Vérifiez que ENCRYPTION_MASTER_KEY est définie dans votre .env');
    process.exit(1);
}

// =======================
// MIDDLEWARE D'AUTHENTIFICATION
// =======================

const authenticateN8N = (req, res, next) => {
    const internalToken = req.headers['x-internal-token'];
    
    // Vérification du token
    if (!internalToken || internalToken !== process.env.N8N_INTERNAL_TOKEN) {
        // Log de tentative d'accès non autorisé
        console.warn(`[SECURITY] Tentative d'accès non autorisé depuis ${req.ip} - ${req.path}`);
        
        return res.status(401).json({ 
            error: 'Unauthorized',
            message: 'Token interne invalide ou manquant'
        });
    }
    
    // Validation supplémentaire : vérifier que le token a le bon format
    if (internalToken.length < 32) {
        return res.status(401).json({ 
            error: 'Unauthorized',
            message: 'Format de token invalide'
        });
    }
    
    next();
};

// =======================
// MIDDLEWARE DE LOGGING STRUCTURÉ
// =======================

const requestLogger = (req, res, next) => {
    const start = Date.now();
    
    // Log après la réponse
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logData = {
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userAgent: req.get('user-agent')
        };
        
        // Log différent selon le status
        if (res.statusCode >= 400) {
            console.error('[ERROR]', JSON.stringify(logData));
        } else {
            console.log('[ACCESS]', JSON.stringify(logData));
        }
    });
    
    next();
};

app.use(requestLogger);

// =======================
// VALIDATION DES ENTRÉES
// =======================

const validateUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
};

const validateServiceName = (serviceName) => {
    const allowedServices = ['google', 'microsoft', 'facebook', 'linkedin', 'slack', 'openai', 'anthropic', 'notion'];
    return allowedServices.includes(serviceName);
};

// =======================
// ROUTES SANTÉ ET MONITORING
// =======================

// Health check basique
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'otobot-internal-api',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Health check détaillé (protégé)
app.get('/health/detailed', authenticateN8N, async (req, res) => {
    try {
        // Test de la base de données
        const dbCheck = await pool.query('SELECT NOW()');
        
        res.json({
            status: 'ok',
            service: 'otobot-internal-api',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: {
                status: 'connected',
                time: dbCheck.rows[0].now
            },
            memory: process.memoryUsage(),
            environment: process.env.NODE_ENV
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            service: 'otobot-internal-api',
            database: {
                status: 'disconnected',
                error: error.message
            }
        });
    }
});

// =======================
// ROUTES API PRINCIPALES
// =======================

/**
 * Récupère les credentials d'un client pour un service
 * GET /api/internal/credentials/:clientId/:serviceName
 */
app.get('/api/internal/credentials/:clientId/:serviceName', 
    authenticateN8N, 
    strictLimiter,  // Rate limiting strict pour cet endpoint
    async (req, res) => {
    try {
        const { clientId, serviceName } = req.params;
        
        // Validation des paramètres
        if (!validateUUID(clientId)) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Client ID invalide'
            });
        }
        
        if (!validateServiceName(serviceName)) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Nom de service invalide'
            });
        }
        
        // Suite du code identique à la version précédente...
        // [Le reste du code de l'endpoint reste identique]
        
    } catch (error) {
        console.error('Erreur lors de la récupération des credentials:', error);
        
        // Ne pas exposer les détails de l'erreur en production
        const message = process.env.NODE_ENV === 'production' 
            ? 'Une erreur est survenue' 
            : error.message;
            
        res.status(500).json({ 
            error: 'Internal server error',
            message: message
        });
    }
});

// =======================
// GESTION DES ERREURS GLOBALES
// =======================

// 404 pour les routes non trouvées
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'Endpoint non trouvé'
    });
});

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
    console.error('[ERROR] Erreur non gérée:', err);
    
    // Erreur CORS
    if (err.message === 'Non autorisé par CORS') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Origine non autorisée'
        });
    }
    
    // Erreur de validation JSON
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            error: 'Bad Request',
            message: 'JSON invalide'
        });
    }
    
    // Erreur générique
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' 
            ? 'Une erreur inattendue est survenue'
            : err.message
    });
});

// =======================
// GESTION GRACIEUSE DE L'ARRÊT
// =======================

process.on('SIGTERM', async () => {
    console.log('SIGTERM reçu, arrêt gracieux en cours...');
    
    // Fermer les nouvelles connexions
    server.close(() => {
        console.log('Serveur HTTP fermé');
    });
    
    // Fermer le pool de connexions
    try {
        await pool.end();
        console.log('Pool de connexions PostgreSQL fermé');
    } catch (err) {
        console.error('Erreur lors de la fermeture du pool:', err);
    }
    
    process.exit(0);
});

// =======================
// DÉMARRAGE DU SERVEUR
// =======================

const PORT = process.env.INTERNAL_API_PORT || 3001;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════╗
║   API Interne Otobot démarrée          ║
║   Port: ${PORT}                           ║
║   Environnement: ${process.env.NODE_ENV || 'development'}          ║
║   PID: ${process.pid}                           ║
╚════════════════════════════════════════╝
    `);
});