-- Script d'initialisation des bases de données
-- Généré automatiquement

-- Base Frontend
CREATE DATABASE IF NOT EXISTS otobot_frontend;
CREATE USER IF NOT EXISTS frontend_user WITH ENCRYPTED PASSWORD 'rFjy4nJHpgD2ke/4K0OVNkAPT88ncLOJvK3QorCGRWA';
GRANT ALL PRIVILEGES ON DATABASE otobot_frontend TO frontend_user;

-- Base ToolJet  
CREATE DATABASE IF NOT EXISTS otobot_tooljet;
CREATE USER IF NOT EXISTS tooljet_user WITH ENCRYPTED PASSWORD 'Q1I45Q/gYUn1YpVecYkCticiYwcTYs79446Vx4VhD8o';
GRANT ALL PRIVILEGES ON DATABASE otobot_tooljet TO tooljet_user;

-- Extension pgcrypto pour le chiffrement
\c otobot_frontend
CREATE EXTENSION IF NOT EXISTS pgcrypto;
