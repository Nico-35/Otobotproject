# Introduction et Vue d'Ensemble du Système

### **Le Problème à Résoudre**

Imaginez que vous êtes une entreprise qui utilise plusieurs services en ligne : Gmail, Google Drive, Notion, Slack, etc. Vous souhaitez automatiser des tâches pour gagner en efficacité, comme synchroniser des fichiers, envoyer des notifications ou publier du contenu. Pour cela, vos outils d'automatisation (ici, N8N) ont besoin de se connecter à ces services en votre nom.

La solution Otobot fournit une plateforme qui stocke de manière **ultra-sécurisée** vos "clés d'accès" (appelées tokens ou credentials) pour permettre à N8N de :

1. Se connecter à vos services tiers.
2. Effectuer des actions en votre nom.
3. Le faire de manière totalement sécurisée, auditée et contrôlée.

En somme, au lieu de donner vos mots de passe (ce qui est extrêmement dangereux), vous déléguez une autorisation temporaire et révocable, stockée dans un coffre-fort numérique protégé par un gardien vigilant.

### **L'Architecture Générale d'Otobot**

Otobot est une plateforme d'automatisation multi-tenant sécurisée, où chaque client dispose de son propre environnement isolé sur un VPS.

```plain
┌─────────────────────────────────────────────────────────┐
│                   VPS CLIENT (OVH France)                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐     ┌─────────────┐     ┌───────────┐ │
│  │ PostgreSQL  │◄────│ API Interne │◄────│    N8N    │ │
│  │  (Coffre)   │     │  Port 3001  │     │ Port 5678 │ │
│  └─────────────┘     └─────────────┘     └───────────┘ │
│         ▲                    ▲                    ▲      │
│         │                    │                    │      │
│         └────────────────────┼────────────────────┘      │
│                              │                           │
│                      ┌───────┴────────┐                  │
│                      │    ToolJet     │                  │
│                      │   Port 8082    │                  │
│                      └────────────────┘                  │
└─────────────────────────────────────────────────────────┘
```

### **Principe de Sécurité Fondamental**

Le concept clé à comprendre est que **les credentials des services externes (Google, Notion, Microsoft...) ne sont JAMAIS stockés dans N8N**. Ils sont :

1. **Stockés** dans la base de données PostgreSQL, chiffrés avec l'algorithme AES-256-GCM.
2. **Gérés** par une API interne qui agit comme unique point de contrôle d'accès.
3. **Récupérés** dynamiquement par N8N via un nœud personnalisé au moment de l'exécution du workflow.
4. **Associés** à des utilisateurs spécifiques pour garantir une isolation parfaite (multi-utilisateurs).

### **Les 4 Composants Principaux**

#### **1\. PostgreSQL (Le Coffre-fort)**

*   Stocke tous les credentials (tokens, clés API) de manière chiffrée.
*   Gère les utilisateurs, leurs connexions OAuth et les journaux d'accès pour l'audit.
*   Agit comme le coffre-fort numérique inviolable du système.

#### **2\. API Interne (Le Gardien) - Port 3001**

*   Constitue le seul point d'accès autorisé aux credentials.
*   Authentifie chaque requête provenant des autres services (comme N8N) via un token secret.
*   Déchiffre les credentials "à la volée" uniquement lorsque c'est nécessaire.
*   Gère le flux OAuth2 pour la connexion des utilisateurs aux services tiers.
*   Logue absolument tous les accès pour un audit complet.

#### **3\. N8N (L'Orchestrateur) - Port 5678**

*   Exécute les workflows d'automatisation.
*   Utilise un nœud personnalisé ("Otobot Credential Fetcher") pour demander les credentials à l'API interne.
*   Ne stocke jamais directement les credentials, les utilisant uniquement en mémoire le temps de l'exécution.
*   Est conçu pour fonctionner dans un contexte multi-utilisateurs.

#### **4\. ToolJet (L'Interface Client) - Port 8082**

*   Fournit l'interface web pour les utilisateurs finaux.
*   Permet aux utilisateurs de gérer leurs connexions aux services (connexion, déconnexion).
*   Sert à déclencher manuellement des workflows N8N.
*   Affiche des tableaux de bord et les informations relatives aux services souscrits.

* * *

# Concepts Fondamentaux : Sécurité et Gestion des Données

  
## **Le Système de Chiffrement (Le Coffre-fort)**

### **Pourquoi un chiffrement fort ?**

Stocker des tokens d'accès en clair, c'est comme laisser les clés de sa maison sous le paillasson. Notre système agit comme un coffre-fort de banque avec un gardien. Le coffre-fort est le **chiffrement**, et le gardien est l'**API**.

### **Les Composants du Chiffrement : AES-256-GCM**

Notre système utilise l'algorithme **AES-256-GCM**, un standard adopté par les gouvernements et les institutions financières.

*   **AES (Advanced Encryption Standard)** : C'est l'algorithme de chiffrement lui-même, réputé pour sa robustesse.
*   **256** : Indique la taille de la clé de chiffrement en bits. Une clé de 256 bits offre un nombre de combinaisons astronomique (2^256), la rendant impossible à forcer par brute-force.
*   **GCM (Galois/Counter Mode)** : C'est un mode d'opération qui non seulement chiffre les données, mais garantit aussi leur **authenticité** et leur **intégrité**. Il produit un "tag d'authentification" qui agit comme un sceau de cire : si la donnée chiffrée est modifiée, le sceau est brisé et le déchiffrement échoue.

### **Les Éléments Clés du Processus**

1. **La Clé de Chiffrement Maîtresse (ENCRYPTION\_MASTER\_KEY)**
    *   Une chaîne de 64 caractères hexadécimaux (32 bytes) définie dans le fichier `.env`.
    *   Exemple : `a7f3b2c8d9e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0`.
    *   **C'est l'élément le plus critique du système.** Sans cette clé, toutes les données chiffrées sont définitivement perdues. Elle ne doit jamais être partagée ou stockée dans un endroit non sécurisé.
2. **Le Vecteur d'Initialisation (IV)**
    *   Un nombre aléatoire unique généré pour _chaque_ opération de chiffrement.
    *   Il garantit que si l'on chiffre deux fois la même donnée (ex: le même token), le résultat sera différent à chaque fois. Cela empêche les attaques par reconnaissance de motifs.
    *   L'IV n'est pas secret et est stocké avec la donnée chiffrée.
3. **Le Tag d'Authentification (Auth Tag)**
    *   Une signature cryptographique générée par le mode GCM.
    *   Il est vérifié lors du déchiffrement pour s'assurer que la donnée n'a pas été altérée depuis son chiffrement.

### **Le Processus de Chiffrement et de Déchiffrement**

**Processus de Chiffrement :**

```bash
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Donnée Claire  │────▶│   Chiffrement   │────▶│ Donnée Chiffrée │
│ "Token123..."   │     │   + Clé + IV    │     │  "x9$mK#2@..."  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

Ce qui est réellement stocké en base de données est une chaîne unique qui combine tous les éléments nécessaires au déchiffrement (sauf la clé maîtresse) :

version:iv:authTag:donnée\_chiffrée

Exemple : 1:f3a2b5c8d9e4f5a6b7:9d8e7f6a5b4c3d2e:x9$mK#2@pL9b7n5...

Processus de Déchiffrement :

L'API effectue l'opération inverse. Elle reçoit la chaîne de la base de données, la décompose en ses différents éléments, utilise la clé maîtresse secrète pour déchiffrer la donnée, et vérifie que le tag d'authentification est valide.

```plain
┌──────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Données    │────▶│  Déchiffrement  │────▶│   Token     │
│  Chiffrées   │     │   + Clé + IV    │     │   Clair     │
└──────────────┘     └─────────────────┘     └─────────────┘
                            │
                            ▼
                    Vérification du tag
                    (intégrité garantie)
```

Si le tag ne correspond pas, l'opération échoue, signalant une possible corruption ou tentative de modification des données.

## **L'API Interne (Le Gardien)**

### **Architecture de l'API**

L'API est conçue avec plusieurs couches de sécurité qui agissent comme des filtres successifs pour chaque requête reçue.

```elixir
┌─────────────────────────────────────────────────────┐
│                   API INTERNE                        │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. AUTHENTIFICATION (Middleware)                    │
│     └─> Vérifie le token 'x-internal-token'          │
│                                                      │
│  2. VALIDATION (Middleware)                          │
│     └─> Vérifie les paramètres (UUID, service...)   │
│                                                      │
│  3. RATE LIMITING (Middleware)                       │
│     └─> Limite le nombre de requêtes                │
│                                                      │
│  4. ROUTES (Endpoints)                               │
│     ├─> GET /health                                  │
│     ├─> GET /api/internal/user/:id/credentials/:service  │
│     └─> ... autres routes ...                        │
│                                                      │
│  5. GESTIONNAIRE DE CREDENTIALS                      │
│     └─> Appelle le module de Chiffrement/Déchiffrement│
│                                                      │
│  6. LOGGING                                          │
│     └─> Enregistre toutes les actions importantes     │
└─────────────────────────────────────────────────────┘
```

#### **Couche 1 : Authentification**

Chaque service interne (comme N8N) qui souhaite communiquer avec l'API doit présenter un "badge d'accès" secret dans les en-têtes de sa requête.

JavaScript

```cs
// Requête de N8N vers l'API
headers: {
  'x-internal-token': 'votre-token-secret-partagé-via-env'
}
```

Si le token est manquant ou invalide, la requête est immédiatement rejetée avec une erreur `401 Unauthorized`.

#### **Couche 2 : Validation**

L'API vérifie que les paramètres fournis dans la requête sont valides et conformes au format attendu (ex: un `userId` doit être un UUID valide, un `serviceName` doit être une valeur connue). Cela empêche les requêtes malformées et certaines formes d'injection.

#### **Couche 3 : Rate Limiting (Limitation de débit)**

Pour prévenir les abus ou les attaques par déni de service, l'API limite le nombre de requêtes qu'un client peut effectuer sur une période donnée (ex: 100 requêtes par 15 minutes). Si la limite est dépassée, l'API répond avec une erreur `429 Too Many Requests`.

### **Le Parcours Complet d'une Donnée**

**Scénario : Un utilisateur connecte son compte Google via l'interface ToolJet.**

1. **Phase 1 : Obtention du token**
    *   L'utilisateur clique sur "Connecter mon compte Google" dans ToolJet.
    *   Il est redirigé vers la page d'autorisation de Google.
    *   Après autorisation, Google le redirige vers l'API Otobot avec un code d'autorisation.
2. **Phase 2 : Stockage sécurisé**
    *   L'API Otobot reçoit le code et l'échange contre un `access_token` et un `refresh_token` auprès de Google.
    *   L'API **chiffre immédiatement** ces deux tokens en utilisant la clé maîtresse.
    *   Les tokens chiffrés sont stockés dans la table `client_connections` de la base de données, associés à l'ID de l'utilisateur.
3. **Phase 3 : Utilisation dans un workflow N8N**
    *   Un workflow N8N est déclenché pour cet utilisateur.
    *   Le nœud "Otobot Credential Fetcher" effectue une requête vers l'API : `GET /api/internal/user/USER_ID/credentials/google` avec le token d'authentification interne.
    *   L'API vérifie le token, valide les paramètres, récupère les tokens chiffrés de la base de données.
    *   Elle **déchiffre** l'`access_token` et le renvoie à N8N dans sa réponse.
    *   N8N reçoit le token en clair, l'utilise pour appeler l'API de Google, puis le détruit de sa mémoire à la fin du workflow.

## **Le Système Multi-Utilisateurs et la Gestion du Contexte**

### **Hiérarchie des Données**

Le système est conçu pour être multi-tenant, avec une hiérarchie claire :

```scss
Client (Entreprise)
  └── Users (Utilisateurs individuels)
       └── Connections (Connexions aux services : "Mon compte Google Pro", "Mon compte Slack perso")
            └── Credentials (Les tokens chiffrés pour chaque connexion)
```

Cette structure garantit qu'un utilisateur A ne pourra jamais accéder aux connexions de l'utilisateur B, même s'ils appartiennent à la même entreprise.

### **Implication : Chaque Workflow doit Connaître son Utilisateur**

Puisque les credentials sont liés à un utilisateur spécifique, chaque exécution de workflow doit impérativement savoir **pour quel utilisateur** elle s'exécute.

**Solution recommandée : Webhook avec contexte utilisateur**

1. **Déclenchement par Webhook** : Le point d'entrée de la plupart des workflows est un nœud Webhook.
2. **Contexte transmis par le déclencheur (ToolJet)** : L'application front-end (ToolJet) qui déclenche le workflow doit inclure l'identifiant de l'utilisateur dans le corps de la requête.
3. **Propagation du contexte** : L'ID de l'utilisateur est ensuite passé en paramètre à chaque nœud du workflow qui en a besoin, notamment au nœud "Otobot Credential Fetcher".

#### **Exemple : Déclenchement par ToolJet**

Voici comment ToolJet déclenche un workflow N8N en passant le contexte utilisateur :

JavaScript

```rust
// Dans une query ToolJet
const response = await fetch('http://n8n:5678/webhook/service-execution', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    // Contexte utilisateur dynamique
    userId: globals.currentUser.id,
    clientId: globals.currentUser.clientId,
    
    // Paramètres du workflow
    serviceName: 'notion',
    parameters: {
      // Paramètres spécifiques au service
    }
  })
});
```

#### **Exemple : Workflow N8N recevant le contexte**

Le workflow N8N est structuré pour recevoir et valider ce contexte.

JSON

```swift
{
  "name": "Template Service avec Contexte Utilisateur",
  "nodes": [
    {
      "parameters": { "path": "service-execution" },
      "id": "webhook-trigger",
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook"
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            { "value1": "={{$json[\"userId\"]}}", "operation": "isNotEmpty" }
          ]
        }
      },
      "id": "validate-context",
      "name": "Valider Contexte",
      "type": "n8n-nodes-base.if"
    },
    {
      "parameters": {
        "operation": "getUserCredentials",
        "userId": "={{$node[\"Webhook Trigger\"].json[\"userId\"]}}", // Propagation de l'ID utilisateur
        "service": "={{$node[\"Webhook Trigger\"].json[\"serviceName\"]}}"
      },
      "id": "get-credentials",
      "name": "Récupérer Credentials",
      "type": "n8n-nodes-otobot.otobotCredentialFetcher"
    }
  ]
}
```

Cette approche garantit que chaque exécution est isolée, sécurisée et traçable jusqu'à l'utilisateur qui l'a initiée.

* * *

# Guide de Déploiement Complet de la Stack Otobot

Ce guide décrit, étape par étape, le déploiement de la solution complète sur un serveur VPS.

## **Phase 1 : Préparation du Serveur VPS**
### **Prérequis**

*   Un serveur VPS avec Ubuntu 22.04+ (au moins 4GB de RAM recommandés).
*   Accès root ou un utilisateur avec des privilèges `sudo`.
*   Un terminal SSH.

### **1.1 Mise à jour du système**

Bash

```powershell
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nano wget
```

### **1.2 Installation de Docker et Docker Compose**

Bash

```plain
# Télécharger et exécuter le script d'installation officiel de Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Ajouter l'utilisateur courant au groupe docker pour éviter d'utiliser sudo
sudo usermod -aG docker $USER

# Se déconnecter et se reconnecter pour que les changements de groupe prennent effet
exit
# ssh ... (reconnectez-vous à votre VPS)

# Vérifier l'installation
docker --version
docker compose version
```

### **1.3 Configuration du pare-feu (UFW)**

Bash

```plain
# Autoriser les connexions SSH (essentiel !)
sudo ufw allow ssh

# Autoriser les ports des services qui seront exposés publiquement
sudo ufw allow 80/tcp    # HTTP (pour le proxy inversé Nginx)
sudo ufw allow 443/tcp   # HTTPS (pour le proxy inversé Nginx)
# Ports pour un accès direct (utile en développement, à revoir en production)
sudo ufw allow 5678/tcp  # N8N
sudo ufw allow 8082/tcp  # ToolJet

# Activer le pare-feu
sudo ufw --force enable
sudo ufw status
```

## **Phase 2 : Installation du Projet**

### **2.1 Clonage du Repository**

Bash

```bash
# Naviguer vers le répertoire de base de l'utilisateur
cd ~

# Cloner le projet depuis votre repository Git
git clone git@github.com:votre-org/Otobotproject.git
cd Otobotproject
```

### **2.2 Création des fichiers de configuration**

Les configurations sensibles sont stockées dans des fichiers `.env` qui ne sont pas versionnés dans Git.

Bash

```plain
# Copier les fichiers d'exemple pour créer vos propres fichiers de configuration
cp .env.example .env
cp tooljet.env.example tooljet.env
```

## **Phase 3 : Configuration et Génération des Secrets**

Cette phase est **critique** pour la sécurité de votre déploiement.

### **3.1 Génération des Mots de Passe et Clés**

Utilisez les commandes suivantes pour générer des secrets robustes. **Stockez ces valeurs dans un gestionnaire de mots de passe sécurisé.**

Bash

```perl
# 1. Mot de passe pour l'utilisateur admin de PostgreSQL
openssl rand -base64 32

# 2. Mot de passe pour l'utilisateur de la base de données de l'API (frontend)
openssl rand -base64 32

# 3. Mot de passe pour l'utilisateur de la base de données de ToolJet (IMPORTANT: ne doit pas contenir de '=')
openssl rand -base64 32 | tr -d "=/+"

# 4. Clé de chiffrement maîtresse (CRITIQUE)
openssl rand -hex 32

# 5. Token secret pour la communication interne entre N8N et l'API
openssl rand -base64 48

# 6. Secret pour la signature des tokens JWT de l'API
openssl rand -base64 48

# 7. Secret pour la signature des tokens JWT de N8N
openssl rand -base64 48

# 8, 9, 10. Secrets divers pour ToolJet
openssl rand -hex 32      # Pour TOOLJET_SECRET_KEY_BASE
openssl rand -hex 32      # Pour TOOLJET_ENCRYPTION_KEY
openssl rand -base64 48   # Pour TOOLJET_JWT_SECRET
```

### **3.2 Configuration du fichier** **`.env`**

Ouvrez le fichier `.env` (`nano .env`) et remplissez-le avec les valeurs que vous venez de générer.

Extrait de code

```plain
# === GENERAL ===
NODE_ENV=production
TZ=Europe/Paris

# === POSTGRESQL ===
POSTGRES_DB=otobot_n8n
POSTGRES_USER=otobot_admin
POSTGRES_PASSWORD=[VALEUR 1]

# === N8N ===
N8N_HOST=n8n.votredomaine.com
N8N_PORT=5678
N8N_PROTOCOL=https
WEBHOOK_URL=https://n8n.votredomaine.com/
N8N_JWT_SECRET=[VALEUR 7]

# === API INTERNE & DB FRONTEND ===
FRONTEND_DB_NAME=otobot_frontend
FRONTEND_DB_USER=frontend_user
FRONTEND_DB_PASSWORD=[VALEUR 2]
INTERNAL_API_PORT=3001
ENCRYPTION_MASTER_KEY=[VALEUR 4 - CRITIQUE]
N8N_INTERNAL_TOKEN=[VALEUR 5]
API_JWT_SECRET=[VALEUR 6]

# === TOOLJET & DB TOOLJET ===
TOOLJET_DB=otobot_tooljet
TOOLJET_DB_USER=tooljet_user
TOOLJET_DB_PASS=[VALEUR 3 - Sans =]
TOOLJET_HOST=https://app.votredomaine.com
TOOLJET_PORT=8082
LOCKBOX_MASTER_KEY=[IDEM VALEUR 4]
TOOLJET_SECRET_KEY_BASE=[VALEUR 8]
TOOLJET_ENCRYPTION_KEY=[VALEUR 9]
TOOLJET_JWT_SECRET=[VALEUR 10]
```

### **3.3 Configuration du fichier** **`tooljet.env`**

Ouvrez le fichier `tooljet.env` (`nano tooljet.env`) et configurez l'URL de la base de données.

Extrait de code

```plain
# Le mot de passe [VALEUR 3] doit être le même que dans le fichier .env principal
DATABASE_URL=postgresql://tooljet_user:[VALEUR 3]@postgres:5432/otobot_tooljet?sslmode=disable
PG_SSL=false
PORT=8082
```

## **Phase 4 : Initialisation de la Base de Données**

### **4.1 Lancement du service PostgreSQL**

Bash

```plain
# Démarrer uniquement le conteneur PostgreSQL
docker compose up -d postgres

# Attendre environ 30 secondes que le service soit pleinement initialisé
sleep 30

# Vérifier les logs pour confirmer que la base de données est prête
docker compose logs postgres
```

### **4.2 Création des Bases de Données et des Utilisateurs**

Bash

```sql
# Exporter les variables du .env pour les utiliser dans le script
source .env

# Exécuter les commandes SQL pour créer les BDD et les utilisateurs
docker exec -i otobot_postgres_db psql -U $POSTGRES_USER -d postgres << EOF
-- Base de données pour l'API
CREATE DATABASE otobot_frontend;
CREATE USER frontend_user WITH ENCRYPTED PASSWORD '$FRONTEND_DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE otobot_frontend TO frontend_user;

-- Base de données pour ToolJet
CREATE DATABASE otobot_tooljet;
CREATE USER tooljet_user WITH ENCRYPTED PASSWORD '$TOOLJET_DB_PASS';
GRANT ALL PRIVILEGES ON DATABASE otobot_tooljet TO tooljet_user;
ALTER USER tooljet_user CREATEDB; -- Permission requise par ToolJet

-- Activer l'extension pgcrypto pour le chiffrement
\c otobot_frontend
CREATE EXTENSION IF NOT EXISTS pgcrypto;
EOF
```

### **4.3 Exécution des scripts de création de tables**

Bash

```plain
# Exécuter le script SQL pour créer le schéma de la base de l'API
docker exec -i otobot_postgres_db psql -U frontend_user -d otobot_frontend < sql/create-frontend-database.sql
```

## **Phase 5 : Déploiement des Applications**

### **5.1 Installation des dépendances et construction des images**

Bash

```plain
# Installer les dépendances pour l'API (si elles ne sont pas gérées dans le Dockerfile)
# cd api-internal && npm install --production && cd ..

# Construire les images Docker pour les services personnalisés
docker compose build api-internal token-refresher
```

### **5.2 Lancement de toute la stack**

Bash

```plain
# Lancer tous les services définis dans docker-compose.yml
docker compose --profile api --profile frontend up -d

# Vérifier que tous les conteneurs sont en cours d'exécution et en bonne santé
docker compose ps
```

## **Phase 6 : Configuration Initiale des Services**

### **6.1 Configuration de N8N**

1. Accédez à l'URL de votre N8N (ex: `http://IP_DU_VPS:5678`).
2. Créez le compte propriétaire (administrateur).
3. Naviguez dans `Credentials` -> `New`.
4. Créez une nouvelle credential de type `Otobot Database Connection` (ce type est disponible grâce aux nœuds personnalisés).
5. Remplissez les champs :
    *   **Credential Name**: `Otobot API Connection`
    *   **API Interne URL**: [`http://api-internal:3001`](http://api-internal:3001/) (nom du service Docker)
    *   **Token Interne**: La valeur de `N8N_INTERNAL_TOKEN` de votre fichier `.env`.

### **6.2 Configuration de ToolJet**

1. Accédez à l'URL de votre ToolJet (ex: `http://IP_DU_VPS:8082`).
2. Créez le compte administrateur.
3. Naviguez dans `Data Sources` et créez une nouvelle source de type `REST API`.
4. Configurez-la comme suit :
    *   **Name**: `Otobot API`
    *   **URL**: [`http://api-internal:3001`](http://api-internal:3001/)
    *   **Headers**:
        *   `Content-Type`: `application/json`
        *   `Authorization`: `Bearer {{globals.authToken}}` (cela utilisera dynamiquement le token JWT de l'utilisateur connecté à ToolJet).

## **Phase 7 : Validation Complète du Système**

### **7.1 Tests de santé des services**

Bash

```plain
# Tester la disponibilité de l'API interne
curl http://localhost:3001/health
# Attendu: {"status":"ok", "service":"otobot-internal-api", ...}

# Tester N8N (devrait retourner une redirection vers la page de login)
curl -I http://localhost:5678

# Tester ToolJet
curl -I http://localhost:8082
```

### **7.2 Création d'un client de test pour un test de bout en bout**

Bash

```plain
# 1. Générer un hash de mot de passe pour le client de test
HASH=$(docker compose exec api-internal node -e "const bcrypt = require('bcrypt'); bcrypt.hash('Test123!', 10).then(hash => console.log(hash));")

# 2. Insérer le client dans la base de données
docker exec otobot_postgres_db psql -U frontend_user -d otobot_frontend -c "INSERT INTO clients (email, company_name, password_hash) VALUES ('test@otobot.fr', 'Entreprise Test', '$HASH');"

# 3. Tester la connexion via l'API
curl -X POST http://localhost:3001/api/tooljet/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@otobot.fr","password":"Test123!"}'
# Attendu: Une réponse JSON contenant un authToken (JWT).
```

* * *

# Guide du Développeur : Construire sur la Plateforme Otobot

## **Le Nœud N8N Personnalisé : "Otobot Credential Fetcher"**

Le cœur de l'intégration entre N8N et le système de gestion des credentials est le nœud personnalisé `otobotCredentialFetcher`.

### **Opérations disponibles**

Le nœud propose plusieurs opérations :

1. **Get User Credentials**: Récupère les tokens pour un utilisateur et un service spécifique. C'est l'opération la plus courante.
2. **List User Connections**: Liste toutes les connexions actives d'un utilisateur (ex: pour savoir si un utilisateur a connecté son compte Google).
3. **Check Connection Status**: Vérifie la validité d'une connexion spécifique (ex: si un token est expiré).

### **Exemple d'utilisation : Récupérer un token Notion**

JavaScript

```awk
// Configuration du node "Otobot Credential Fetcher" dans N8N
{
  "operation": "getUserCredentials",
  "userId": "{{$json.body.userId}}", // Récupéré dynamiquement depuis le trigger
  "service": "notion"
}

// Output du node (exemple)
{
  "connectionId": "abc-123",
  "hasCredentials": true,
  "credentials": {
    "apiKey": "secret_AbCdEf..." // Le token Notion déchiffré
  },
  "metadata": {
    "accountIdentifier": "Nom du workspace Notion",
    "tokenExpired": false
  }
}
```

## **Développement de Workflows N8N : Patrons et Bonnes Pratiques**

### **Le Patron de Base d'un Workflow Sécurisé**

```livescript
Webhook Trigger -> IF (Valider Input) -> Otobot Credential Fetcher -> HTTP Request (Appel API externe) -> IF (Gestion Erreur) -> Respond to Webhook
```

### **Bonnes Pratiques Essentielles**

*   ✅ **TOUJOURS** utiliser une variable dynamique pour l'ID utilisateur (`{{$json.body.userId}}`). Ne jamais coder en dur un ID.
*   ✅ **TOUJOURS** sécuriser vos webhooks (via Header Auth et un secret partagé).
*   ✅ **TOUJOURS** implémenter une gestion des erreurs robuste, notamment pour les cas où les credentials ne sont pas trouvés ou sont expirés.
*   ✅ **TOUJOURS** logger les actions sensibles et les erreurs dans une base de données ou un service de logging.
*   ❌ **JAMAIS** stocker des credentials en dur dans les workflows N8N.
*   ❌ **JAMAIS** logger des tokens ou des données sensibles en clair.

### **Gestion des Erreurs Courantes**

*   **Connection not found (404)** : Le nœud Otobot renverra `{"error": "Connection not found", "hasCredentials": false}`. Utilisez un nœud `IF` pour détecter ce cas et notifier l'utilisateur qu'il doit connecter son service.
*   **Token expiré (erreur 401 de l'API externe)** : Implémentez un bloc `Try/Catch`. Si une erreur 401 survient, utilisez le nœud Otobot avec l'opération `Check Connection Status` pour confirmer l'expiration, puis notifiez l'utilisateur.
*   **Rate Limiting (erreur 429 de l'API externe)** : Dans votre gestion d'erreur, ajoutez un nœud `Wait` avec un délai exponentiel (backoff) avant de réessayer l'appel un nombre limité de fois.

## **Exemples de Workflows N8N Complets**

### **Workflow 1 : Synchronisation Google Drive vers Notion**

Ce workflow est déclenché par un webhook, récupère les credentials Google et Notion pour un utilisateur, liste les nouveaux fichiers sur Drive, et crée des pages correspondantes dans une base de données Notion.

Le JSON complet de ce workflow se trouve dans le document [otobot-doc-complete.md](http://otobot-doc-complete.md/).

### **Workflow 2 : Notification Multi-Canal**

Ce workflow récupère la liste des connexions d'un utilisateur, et en fonction des services actifs (Google, Slack), envoie une notification par email et/ou sur un canal Slack.

Le JSON complet de ce workflow se trouve dans le document [otobot-doc-complete.md](http://otobot-doc-complete.md/).

### **Workflow 3 : Maintenance Automatique des Tokens**

Ce workflow s'exécute quotidiennement (via un nœud Cron), parcourt tous les utilisateurs, vérifie la date d'expiration de leurs connexions, et envoie une alerte par email si une reconnexion est bientôt nécessaire.

Le JSON complet de ce workflow se trouve dans le document [otobot-doc-complete.md](http://otobot-doc-complete.md/).

## **Intégration avec ToolJet**

### **Déclencher un Workflow N8N depuis ToolJet**

Créez une `Query` dans ToolJet pour appeler le webhook de votre workflow N8N.

```dts
// Query ToolJet: triggerWorkflow
Method: POST
URL: http://n8n:5678/webhook/{{parameters.workflowPath}} // ou l'URL publique de N8N
Headers: {
  "X-Webhook-Secret": "{{globals.webhookSecret}}"
}
Body: {
  // Contexte dynamique
  "userId": "{{globals.currentUser.id}}",
  
  // Données pour le workflow
  "data": "{{components.inputData.value}}" 
}
```

### **Recevoir des Mises à Jour de N8N dans ToolJet**

Pour informer ToolJet de la fin d'un workflow, utilisez un nœud `HTTP Request` à la fin de votre workflow N8N pour appeler un webhook exposé par ToolJet.

```php
// Nœud HTTP Request dans N8N
{
  "method": "POST",
  "url": "{{$env.TOOLJET_URL}}/api/webhooks/workflow-complete",
  "body": {
    "userId": "{{$json.userId}}",
    "workflowId": "{{$workflow.id}}",
    "status": "success",
    "results": "{{$json.results}}" // Les résultats finaux du workflow
  }
}
```

* * *

# Maintenance, Supervision et Sécurité du Système

## **Sécurité en Profondeur**

La sécurité est une superposition de plusieurs couches de défense.

*   **Niveau 1 : Protection Physique et Réseau**
    *   Serveur hébergé en France (OVH).
    *   Accès SSH par clé uniquement.
    *   Pare-feu (UFW) limitant les ports ouverts.
    *   Réseau Docker interne isolant les services les uns des autres.
*   **Niveau 2 : Protection Applicative**
    *   **Authentification** : Toutes les communications inter-services (N8N -> API) sont authentifiées par un token secret.
    *   **Validation** : Validation systématique des entrées pour se prémunir contre les injections.
    *   **Rate Limiting** : Protection contre les attaques par force brute ou déni de service.
*   **Niveau 3 : Protection des Données**
    *   **Chiffrement** : Utilisation de AES-256-GCM pour toutes les données sensibles au repos.
    *   **Gestion des Clés** : La `ENCRYPTION_MASTER_KEY` est stockée uniquement dans une variable d'environnement, jamais dans le code ou la base de données.
    *   **Principe du moindre privilège** : Chaque composant n'a que les droits strictement nécessaires à son fonctionnement.
    *   **Audit** : Journalisation de tous les accès aux credentials.

## **Maintenance, Supervision et Dépannage**

### **Commandes de Maintenance Quotidienne**

Bash

```jboss-cli
# 1. Vérifier l'état de tous les services Docker
docker compose ps
​
# 2. Consulter les logs récents de l'API à la recherche d'erreurs
docker compose logs api-internal --tail=100 | grep -i "error"
​
# 3. Vérifier l'état de santé de l'API
curlhttp://localhost:3001/health
​
# 4. Lancer le script de diagnostic complet (voir ci-dessous)
~/check-otobot.sh
```

### **Sauvegardes Automatiques**

Il est **critique** de mettre en place des sauvegardes régulières.

1. **Sauvegarde de la base de données** :
2. Bash

```perl
# Script à exécuter via une tâche cron
BACKUP_DIR="/home/ubuntu/backups/$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR
docker exec otobot_postgres_db pg_dumpall -U otobot_admin > $BACKUP_DIR/postgres_full.sql
```

1. **Sauvegarde des fichiers de configuration et des volumes** :
    *   Sauvegardez votre fichier `.env` dans un endroit sécurisé.
    *   Sauvegardez les volumes Docker (`n8n_data`, `tooljet_data`, etc.).

### **Script de Diagnostic Automatique**

Un script complet ([`check-otobot.sh`](http://check-otobot.sh/) fourni dans le document `2025-06-04-Documentation complète Tooljet Frontend` [`v3.md`](http://v3.md/)) permet de vérifier tous les points critiques de l'installation : services Docker, ports, variables d'environnement, connexion à la base de données, etc. Il est recommandé de l'utiliser pour tout dépannage initial.

### **Dépannage des Problèmes Courants**

Le document `2025-06-04...` contient une section de dépannage très détaillée couvrant des problèmes comme :

*   "Cannot connect to the Docker daemon"
*   "ENCRYPTION\_MASTER\_KEY must be 32 bytes"
*   ToolJet bloqué au démarrage
*   "password authentication failed for user"
*   Ports déjà utilisés
*   "Client not found" lors de la connexion

La première étape de tout dépannage doit être `docker compose logs [nom-du-service]` pour inspecter les erreurs.

## **Plan de Réponse aux Incidents**

1. **En cas de compromission suspectée d'un token** :
    *   Désactivez immédiatement la connexion dans la base de données : `UPDATE client_connections SET is_active = false WHERE id = '[ID_CONNEXION]';`.
    *   Notifiez l'utilisateur.
    *   Forcez la révocation du token auprès du fournisseur de service (Google, etc.).
2. **En cas de détection d'un accès non autorisé** :
    *   Bloquez l'adresse IP source au niveau du pare-feu.
    *   Analysez les journaux d'accès de l'API et de Nginx pour identifier l'étendue de l'intrusion.
    *   Effectuez une rotation de tous les secrets concernés (`N8N_INTERNAL_TOKEN`, etc.).
3. **En cas de fuite de données avérée** :
    *   Isolez le système affecté.
    *   Identifiez précisément les données qui ont fuité.
    *   Notifiez les utilisateurs concernés conformément aux réglementations (RGPD).
    *   Mettez à jour tous les credentials et secrets.

* * *

# Annexes



# Annexe A : Référence Complète de l'API Interne

  

### **Authentification**

Toutes les requêtes doivent contenir l'en-tête `x-internal-token: [VOTRE_TOKEN_INTERNE]`.

### **Endpoints pour N8N**

*   `GET /api/internal/user/:userId/credentials/:serviceName`
    *   **Description**: Récupère les credentials actifs pour un utilisateur et un service donnés.
    *   **Réponse 200**: `{ "connectionId": "...", "credentials": { "accessToken": "...", "apiKey": "..." }, "metadata": { ... } }`
    *   **Réponse 404**: `{ "error": "Connection not found", ... }`
*   `GET /api/internal/user/:userId/connections`
    *   **Description**: Liste toutes les connexions d'un utilisateur.
    *   **Réponse 200**: `{ "userId": "...", "connections": [ { "id": "...", "service_name": "google", ... } ] }`
*   `GET /api/internal/connection-status/:connectionId`
    *   **Description**: Vérifie le statut détaillé d'une connexion spécifique.
    *   **Réponse 200**: `{ "id": "...", "status": "valid|refresh_needed|expired", ... }`
*   `GET /health`
    *   **Description**: Endpoint de santé pour la supervision.
    *   **Réponse 200**: `{ "status": "ok", ... }`

# Annexe B : Schéma de la Base de Données

### **Tables importantes (base** **`otobot_frontend`****)**

*   **users**: Contient les informations sur les utilisateurs.
    *   `id` (UUID), `client_id` (UUID), `email`, `role` (admin|user), `is_active`.
*   **clients**: Contient les informations sur les entreprises clientes.
    *   `id` (UUID), `company_name`, `email`, `password_hash`.
*   **services**: Définit les services disponibles (Google, Notion...).
    *   `id`, `service_code`, `display_name`.
*   **client\_connections**: Table centrale qui lie un utilisateur à un service et stocke les credentials.
    *   `id` (UUID), `user_id` (lien vers `users`), `service_id` (lien vers `services`), `encrypted_access_token`, `encrypted_refresh_token`, `token_expires_at`, `is_active`.
*   **credential\_access\_logs**: Journal d'audit pour chaque accès à un credential.
    *   `id`, `client_connection_id`, `source` (ex: N8N), `created_at`.