// monitor-tokens.js - Script de monitoring des tokens
const { Pool } = require('pg');

// Configuration de la connexion
const pool = new Pool({
    host: process.env.FRONTEND_DB_HOST || 'localhost',
    database: process.env.FRONTEND_DB_NAME,
    user: process.env