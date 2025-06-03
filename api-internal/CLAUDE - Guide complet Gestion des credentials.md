# 📚 Guide Complet du Système de Gestion des Credentials Otobot

## Table des matières

1. [Introduction - Comprendre le besoin](#introduction)
2. [Vue d'ensemble du système](#vue-densemble)
3. [Préparation de votre environnement](#preparation)
4. [Installation pas à pas](#installation)
5. [Configuration détaillée](#configuration)
6. [Utilisation quotidienne](#utilisation)
7. [Maintenance et monitoring](#maintenance)
8. [Dépannage](#depannage)
9. [Glossaire](#glossaire)

---

## 🎯 1. Introduction - Comprendre le besoin {#introduction}

### Le problème à résoudre

Imaginez que vous êtes une petite entreprise qui utilise plusieurs services en ligne :
- Gmail pour vos emails
- Google Drive pour vos documents
- Facebook pour votre communication
- LinkedIn pour votre réseau professionnel

Vous voulez automatiser des tâches comme :
- Envoyer automatiquement des emails
- Sauvegarder des fichiers sur Google Drive
- Publier sur les réseaux sociaux

Pour cela, vos automatisations (dans N8N) ont besoin de se connecter à ces services **en votre nom**.

### La solution

Notre système stocke de manière **ultra-sécurisée** vos "clés d'accès" (appelées tokens ou credentials) pour que N8N puisse :
1. Se connecter à vos services
2. Effectuer des actions en votre nom
3. Le faire de manière totalement sécurisée

### Analogie simple

C'est comme donner une procuration à quelqu'un :
- **Sans notre système** : Vous donnez vos mots de passe (dangereux !)
- **Avec notre système** : Vous donnez une autorisation temporaire et révocable, stockée dans un coffre-fort numérique

---

## 🏗️ 2. Vue d'ensemble du système {#vue-densemble}

### Les composants principaux

Notre système est composé de 4 parties principales :

```
┌─────────────────────────────────────────────────────────┐
│                    VOTRE SERVEUR VPS                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐     ┌─────────────┐     ┌───────────┐ │
│  │   Base de   │◄────│     API     │◄────│    N8N    │ │
│  │   Données   │     │   Interne   │     │(Workflows)│ │
│  │  (Coffre)   │     │ (Gardien)   │     │           │ │
│  └─────────────┘     └─────────────┘     └───────────┘ │
│                             ▲                            │
│                             │                            │
│                      ┌──────┴──────┐                    │
│                      │   Frontend   │                    │
│                      │   (Futur)    │                    │
│                      └─────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

#### 1. **Base de données PostgreSQL** (Le Coffre-fort)
- Stocke les tokens de manière chiffrée
- Comme un coffre-fort numérique ultra-sécurisé
- Personne ne peut lire les données sans la clé de déchiffrement

#### 2. **API Interne** (Le Gardien)
- Contrôle l'accès aux tokens
- Vérifie qui a le droit de les utiliser
- Enregistre toutes les utilisations (audit)

#### 3. **N8N** (L'Utilisateur)
- Demande les tokens à l'API quand nécessaire
- Les utilise pour se connecter aux services externes
- Ne stocke jamais les tokens lui-même

#### 4. **Frontend** (L'Interface - à venir)
- Permettra aux clients de connecter leurs comptes
- Interface simple et sécurisée
- Gestion des autorisations

### Le flux de données

1. **Connexion initiale** (via le futur frontend) :
   ```
   Client → Se connecte à Google → Google donne un token → On le chiffre → On le stocke
   ```

2. **Utilisation dans N8N** :
   ```
   N8N → "J'ai besoin du token Google du client X" → API vérifie → Déchiffre → Envoie à N8N
   ```

3. **Sécurité** :
   - Les tokens sont chiffrés avec AES-256 (standard bancaire)
   - Seule l'API peut déchiffrer
   - Tout est tracé pour l'audit

---

## 🛠️ 3. Préparation de votre environnement {#preparation}

### Ce dont vous avez besoin

1. **Un serveur VPS** avec :
   - Ubuntu 22.04 ou plus récent
   - Au moins 2GB de RAM
   - 20GB d'espace disque
   - Docker installé (voir votre procédure existante)

2. **Accès SSH** au serveur

3. **Les fichiers du projet** depuis GitHub

### Structure des fichiers à créer

Voici l'arborescence que nous allons créer :

```
Otobotproject/
├── api-internal/
│   ├── api-internal.js          # L'API principale
│   ├── encryption.js            # Module de chiffrement
│   ├── token-refresher.js       # Script de refresh auto
│   ├── test-connections.js      # Script de test
│   ├── monitor-tokens.js        # Script de monitoring
│   ├── package.json             # Dépendances Node.js
│   ├── Dockerfile               # Pour créer l'image Docker
│   ├── Dockerfile.cron          # Pour le service de refresh
│   └── docker-entrypoint-cron.sh # Script de démarrage cron
├── sql/
│   └── create-frontend-database.sql  # Script de création BDD
├── docker-compose.yml           # Configuration Docker
└── .env                        # Variables d'environnement
```

---

## 📋 4. Installation pas à pas {#installation}

### Étape 1 : Connexion au serveur

```bash
# Depuis votre ordinateur local
ssh -i ~/.ssh/votre_cle_privee ubuntu@IP_DE_VOTRE_VPS
```

### Étape 2 : Préparation du projet

```bash
# Aller dans le dossier du projet
cd /home/ubuntu/Otobotproject

# Créer la structure des dossiers
mkdir -p api-internal sql

# Vérifier que Docker est bien installé
docker --version
docker-compose --version
```

### Étape 3 : Création des fichiers

Je vais vous guider pour créer chaque fichier. Utilisez `nano` ou `vim` pour créer et éditer les fichiers.

#### 3.1 Créer le script SQL

```bash
nano sql/create-frontend-database.sql
```

Copiez-collez le contenu du script SQL que j'ai fourni précédemment (artifact `create-frontend-database`).

#### 3.2 Créer le module de chiffrement

```bash
nano api-internal/encryption.js
```

Copiez-collez le contenu du module de chiffrement (artifact `encryption-module`).

#### 3.3 Créer l'API interne

```bash
nano api-internal/api-internal.js
```

Utilisez la version sécurisée de l'API (artifact `api-internal-secure`).

#### 3.4 Créer les autres fichiers

Continuez ainsi pour tous les fichiers. Je vais vous donner la commande pour chaque :

```bash
# Token refresher
nano api-internal/token-refresher.js

# Script de test
nano api-internal/test-connections.js

# Script de monitoring  
nano api-internal/monitor-tokens.js

# Package.json
nano api-internal/package.json

# Dockerfile API
nano api-internal/Dockerfile

# Dockerfile Cron
nano api-internal/Dockerfile.cron

# Script d'entrée cron
nano api-internal/docker-entrypoint-cron.sh
chmod +x api-internal/docker-entrypoint-cron.sh  # Le rendre exécutable
```

### Étape 4 : Configuration de l'environnement

#### 4.1 Générer une clé de chiffrement

C'est une étape **CRITIQUE** pour la sécurité :

```bash
# Générer une clé de 32 bytes (256 bits)
openssl rand -hex 32
```

Vous obtiendrez quelque chose comme :
```
a7f3b2c8d9e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0
```

**⚠️ IMPORTANT** : Notez cette clé dans un endroit sûr (coffre-fort, gestionnaire de mots de passe).

#### 4.2 Créer le fichier .env

```bash
nano .env
```

Contenu à adapter :

```bash
# Base de données N8N (existante)
POSTGRES_DB=n8n
POSTGRES_USER=n8n_user
POSTGRES_PASSWORD=mot_de_passe_n8n_securise

# Base de données Frontend (nouvelle)
FRONTEND_DB_NAME=otobot_frontend
FRONTEND_DB_USER=frontend_user
FRONTEND_DB_PASSWORD=generer_un_mot_de_passe_securise_ici

# Chiffrement (utilisez la clé générée ci-dessus)
ENCRYPTION_MASTER_KEY=votre_cle_generee_ci_dessus

# Token interne pour communication N8N <-> API
N8N_INTERNAL_TOKEN=generer_un_token_aleatoire_long_ici

# Configuration N8N
N8N_HOST=votre-domaine.com

# Port de l'API interne
INTERNAL_API_PORT=3001
```

Pour générer des mots de passe sécurisés :
```bash
# Générer un mot de passe de 32 caractères
openssl rand -base64 32

# Générer un token de 48 caractères
openssl rand -base64 48
```

### Étape 5 : Mise à jour du Docker Compose

Éditez votre `docker-compose.yml` existant pour ajouter les nouveaux services :

```bash
nano docker-compose.yml
```

Ajoutez les services de l'artifact `docker-compose-api` à votre fichier existant.

### Étape 6 : Création de la base de données

```bash
# Se connecter au conteneur PostgreSQL
docker exec -it postgres bash

# Une fois dans le conteneur, se connecter à PostgreSQL
psql -U $POSTGRES_USER -d $POSTGRES_DB

# Créer la base de données frontend
CREATE DATABASE otobot_frontend;

# Créer l'utilisateur (remplacez le mot de passe)
CREATE USER frontend_user WITH ENCRYPTED PASSWORD 'votre_mot_de_passe_securise';

# Donner les droits
GRANT ALL PRIVILEGES ON DATABASE otobot_frontend TO frontend_user;

# Se connecter à la nouvelle base
\c otobot_frontend

# Quitter psql
\q

# Sortir du conteneur
exit
```

Maintenant, exécutez le script SQL :

```bash
# Copier le script dans le conteneur
docker cp sql/create-frontend-database.sql postgres:/tmp/

# L'exécuter
docker exec -it postgres psql -U frontend_user -d otobot_frontend -f /tmp/create-frontend-database.sql
```

### Étape 7 : Lancer les services

```bash
# Construire les images Docker
docker-compose build api-internal token-refresher

# Lancer les services
docker-compose --profile api up -d

# Vérifier que tout est lancé
docker-compose ps

# Voir les logs
docker-compose logs -f api-internal
```

---

## ⚙️ 5. Configuration détaillée {#configuration}

### Configuration de N8N

Pour que N8N puisse utiliser le système, vous devez :

1. **Ajouter le type de credential personnalisé** (OtobotDatabaseCredential)
2. **Ajouter le node personnalisé** (OtobotCredentialFetcher)

Ces fichiers doivent être placés dans le dossier custom de N8N et N8N doit être redémarré.

### Test du système

Une fois tout installé, testez :

```bash
# Depuis le serveur
cd /home/ubuntu/Otobotproject/api-internal

# Installer les dépendances pour les tests
docker exec -it api-internal npm install

# Lancer les tests
docker exec -it api-internal node test-connections.js
```

Vous devriez voir :
```
🧪 Démarrage des tests du système de credentials...

📋 Test 1: Health Check
✅ API en ligne: { status: 'ok', service: 'otobot-internal-api', ... }

📋 Test 2: Authentification
✅ Rejet correct des requêtes sans token

...
```

---

## 🔧 6. Utilisation quotidienne {#utilisation}

### Ajouter un client de test

Pour tester le système, créons un client fictif :

```bash
# Lancer le script avec données de test
docker exec -it api-internal node test-connections.js --insert-test-data
```

### Utiliser dans N8N

1. Dans N8N, créez une nouvelle credential de type "Otobot Database Connection"
2. Remplissez :
   - Client ID : L'ID du client (UUID)
   - Service : Le service voulu (google, microsoft, etc.)
   - API URL : http://api-internal:3001
   - Token : La valeur de N8N_INTERNAL_TOKEN

3. Dans vos workflows, utilisez le node "Otobot Credential Fetcher"

### Monitoring quotidien

```bash
# Voir l'état des tokens
docker exec -it api-internal node monitor-tokens.js

# Mode surveillance continue
docker exec -it api-internal node monitor-tokens.js --watch
```

---

## 🔍 7. Maintenance et monitoring {#maintenance}

### Vérifications quotidiennes

1. **Tokens expirés** :
   ```bash
   docker exec -it api-internal node monitor-tokens.js | grep "expirés"
   ```

2. **Logs d'erreur** :
   ```bash
   docker-compose logs api-internal | grep ERROR
   ```

3. **Santé du système** :
   ```bash
   curl -H "x-internal-token: VOTRE_TOKEN" http://localhost:3001/health/detailed
   ```

### Sauvegardes

**⚠️ CRITIQUE** : Sauvegardez régulièrement :

1. **La base de données** :
   ```bash
   # Créer un backup
   docker exec postgres pg_dump -U frontend_user otobot_frontend > backup_$(date +%Y%m%d).sql
   ```

2. **Les clés de chiffrement** :
   - Le fichier `.env`
   - La valeur de `ENCRYPTION_MASTER_KEY`
   - Stockez-les dans un coffre-fort séparé

### Rotation des tokens

Tous les mois, changez le `N8N_INTERNAL_TOKEN` :

1. Générer un nouveau token
2. Mettre à jour `.env`
3. Redémarrer l'API : `docker-compose restart api-internal`
4. Mettre à jour dans N8N

---

## 🚨 8. Dépannage {#depannage}

### Problèmes courants et solutions

#### L'API ne démarre pas

```bash
# Vérifier les logs
docker-compose logs api-internal

# Problème courant : clé de chiffrement manquante
# Solution : Vérifier que ENCRYPTION_MASTER_KEY est bien définie dans .env
```

#### Erreur "Unauthorized" dans N8N

- Vérifier que le token dans N8N correspond à `N8N_INTERNAL_TOKEN`
- Vérifier que l'URL de l'API est correcte (http://api-internal:3001)

#### Token expiré

Si un token expire sans refresh token :
1. Le client devra se reconnecter manuellement (futur frontend)
2. En attendant, vous devrez mettre à jour manuellement dans la base

#### Base de données inaccessible

```bash
# Vérifier la connexion
docker exec -it postgres psql -U frontend_user -d otobot_frontend -c "SELECT 1;"

# Si erreur, vérifier les credentials dans .env
```

### Commandes de débogage utiles

```bash
# État des conteneurs
docker-compose ps

# Logs en temps réel
docker-compose logs -f

# Redémarrer un service
docker-compose restart api-internal

# Reconstruire après modification
docker-compose build api-internal
docker-compose up -d api-internal

# Accéder au conteneur
docker exec -it api-internal sh
```

---

## 📖 9. Glossaire {#glossaire}

### Termes techniques expliqués

**API (Application Programming Interface)**
- Interface qui permet à deux applications de communiquer
- Dans notre cas : permet à N8N de demander les tokens

**Token**
- Clé d'accès temporaire donnée par un service (Google, Facebook...)
- Comme un badge visiteur : accès limité et temporaire

**OAuth2**
- Protocole standard pour l'autorisation
- Permet de donner accès sans partager le mot de passe

**Credential**
- Information d'identification (token, clé API, mot de passe)
- Ce qui prouve votre identité auprès d'un service

**Chiffrement AES-256**
- Méthode de protection des données
- AES = Advanced Encryption Standard
- 256 = taille de la clé en bits (très sécurisé)

**Docker**
- Système de conteneurisation
- Permet d'isoler chaque service dans son "conteneur"

**PostgreSQL**
- Base de données relationnelle
- Stocke les informations de manière structurée

**UUID**
- Identifiant unique universel
- Ressemble à : 550e8400-e29b-41d4-a716-446655440000

**Refresh Token**
- Token spécial pour renouveler un token expiré
- Évite de redemander l'autorisation au client

**Rate Limiting**
- Limitation du nombre de requêtes
- Protection contre les abus

---

## 📞 Support et aide

Si vous rencontrez des problèmes :

1. **Consultez d'abord les logs** pour comprendre l'erreur
2. **Utilisez les scripts de test** pour diagnostiquer
3. **Vérifiez cette documentation** 
4. **Documentez précisément** :
   - Ce que vous essayez de faire
   - L'erreur exacte
   - Les logs pertinents

## 🎉 Conclusion

Félicitations ! Vous avez maintenant un système professionnel et sécurisé pour gérer les credentials de vos clients.

**Points clés à retenir** :
- 🔐 La sécurité est primordiale : gardez vos clés en sécurité
- 📊 Surveillez régulièrement avec les scripts de monitoring
- 💾 Faites des sauvegardes régulières
- 📝 Documentez toute modification

Le système est conçu pour être évolutif. Prochaines étapes :
- Développer le frontend pour les clients
- Ajouter de nouveaux services
- Améliorer l'automatisation

Bonne utilisation ! 🚀