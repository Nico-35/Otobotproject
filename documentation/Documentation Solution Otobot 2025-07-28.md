# Le Contexte Otobot

## La proposition de valeur

Otobot est une société française, basée à Rennes. Son objectif est d'aider les entreprises françaises à simplifier, optimiser et automatiser leurs processus via des solutions digitales. Cela couvre les processus administratifs, le marketing, les ventes, la gestion interne, le pilotage d'activité, ...

Dans ce but, Otobot implémente pour ses clients des solutions informatiques afin de permettre l'automatisation de processus fortement consommateurs de ressources (cout ou temps) mais à faible valeur ajoutée. Le temps ou le cout économisé par le client peut alors être affecté à des tâches à plus forte valeur ajoutée.

Otobot porte des valeurs fortes autour de 2 sujets "piliers" : la sécurisation et la souveraineté des systèmes d'informations. Les solutions proposées ou mises en oeuvre par Otobot s'appuie sur des solutions proposants les meilleurs niveaux de sécurité de l'information. Ces solutions seront hébergées (sauf contrainte forte) sur des serveurs français offrant les meilleures prestations de service et de sécurité.

## Les solutions implémentées

Les différentes solutions implémentées par Otobot sont les suivantes :

* Mise en oeuvre de chatbots et de formulaires intelligents sur site web : permet de guider et qualifier vos prosepcts, ... A compléter
* La création de workflows d'automatisations :
  * automatisation de tâches récurrentes
  * interfaces de transfert de données entre applications (API)
  * récupération de données (API)
  * interfaces avec des solutions d'IA
  * actions déclenchées par un chatbot, un formulaire, ...
  * webooks
* La mise en oeuvre d'une IA interne à l'entreprise
  * Mise à disposition de notre IA Interne via notre serveur "IA Interne" (voir Architecture)
  * Soit besoin d'un serveur IA Interne dédié à un client (si besoin important)
  * Création d'agent IA sécurisés internes
  * Création de RAG adossé à l'IA interne
  * Mise à disposition d'une solution hébergé de chat (LibreChat)

Le client dispose d'une plateforme Otobot, dans laquelle il dispose d'un compte client, et lui permettant de :

* se connecter à ses applications tierces
* déclencher des workflows
* surveiller l'état de ses automatisations

# Architecture globale de la solution

## **L'Architecture Générale d'Otobot**

Otobot est une plateforme d'automatisation multi-tenant sécurisée, où chaque client dispose de son propre environnement isolé sur un VPS, avec accès à un serveur IA mutualisé.

> [!IMPORTANT]
>
> Schéma à remplacer :
>
> - Les services LibreChat et Mongo sont sur le serveur VPS DEV
> - A vérifier, mais sur VPS DEV, NGINX n'adresse pas que Tooljet non ? Si oui, il faut le reparamétrer pour publier N8N en accès public



```
┌─────────────────────────────────────────────────────────┐     ┌─────────────────────────────────────────────────────────┐
│                   VPS DEV (OVH France)                │     │              SERVEUR IA INTERNE (OVH L4 90)              │
├─────────────────────────────────────────────────────────┤     ├─────────────────────────────────────────────────────────┤
│                                                          │     │                                                          │
│  ┌─────────────┐     ┌─────────────┐     ┌───────────┐ │     │  ┌─────────────┐     ┌─────────────┐     ┌───────────┐ │
│  │ PostgreSQL  │◄────│ API Interne │◄────│    N8N    │ │     │  │   Ollama    │◄────│    Caddy    │◄────│ LibreChat │ │
│  │  (Coffre)   │     │  Port 3001  │     │ Port 5678 │ │     │  │ Port 11434  │     │ Port 443/80 │     │ Port 3080 │ │
│  └─────────────┘     └─────────────┘     └───────────┘ │     │  │   (GPU)     │     │   (HTTPS)   │     │           │ │
│         ▲                    ▲                    ▲      │     │  └─────────────┘     └─────────────┘     └───────────┘ │
│         │                    │                    │      │     │         ▲                                      ▲         │
│         └────────────────────┼────────────────────┘      │     │         │                                      │         │
│                              │                           │     │  ┌──────┴──────┐                        ┌─────┴─────┐  │
│                      ┌───────┴────────┐                  │     │  │   MongoDB   │                        │  MongoDB  │  │
│                      │    ToolJet     │                  │     │  │ Port 27017  │                        │Port 27017 │  │
│                      │   Port 8082    │                  │     │  └─────────────┘                        └───────────┘  │
│                      └────────────────┘                  │     │                                                          │
│                              ▲                           │     │                         ia.otobot.fr                     │
│                      ┌───────┴────────┐                  │     └─────────────────────────────────────────────────────────┘
│                      │  Nginx Proxy   │                  │                                   ▲
│                      │ Ports 80/443   │                  │                                   │
│                      └────────────────┘                  │                                   │
└─────────────────────────────────────────────────────────┘                                   │
                               ▲                                                               │
                               │                                                               │
                               └───────────────────────────────────────────────────────────────┘
                                                     Communication HTTPS sécurisée
```

## Serveur "IA Interne"

Le serveur IA Interne est un serveur dédié haute performance (OVH L4 90) équipé d'un GPU NVIDIA pour l'exécution de modèles d'IA locaux. Il héberge :

### **1. Ollama (Le Moteur IA)**

* Service d'inférence pour Large Language Models (LLM)
* Supporte plusieurs modèles simultanément (Mistral, Llama3, Gemma, etc.)
* Gestion automatique du "hot-swapping" des modèles en VRAM
* Expose une API compatible OpenAI sur le port 11434

### **2. Caddy (Le Reverse Proxy Sécurisé)**

* Gère automatiquement les certificats SSL/TLS via Let's Encrypt
* Authentification par clé API (Bearer token)
* Expose l'API Ollama de manière sécurisée sur https://ia.otobot.fr
* Configuration dans `/etc/caddy/Caddyfile`

## **Installation et Configuration**

### **Phase 1 : Préparation GPU**

```bash
# Installation des drivers NVIDIA
sudo apt install nvidia-driver-570-server
sudo reboot

# Vérification
nvidia-smi

# Installation du NVIDIA Container Toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
# ... (suite des commandes d'installation)
```

### **Phase 2 : Déploiement Ollama avec Docker**

```yaml
# docker-compose.yml pour Ollama
version: '3.8'
services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

volumes:
  ollama_data:
    driver: local
```

### **Phase 3 : Configuration Caddy**

```
ia.otobot.fr {
    log {
        output file /var/log/caddy/ia.otobot.fr.log
    }

    @unauthorized {
        not header Authorization "Bearer VOTRE_CLE_API_SECRETE"
    }
    respond @unauthorized "Unauthorized" 401

    reverse_proxy localhost:11434
}
```



## Serveur "VPS Dev"

Le serveur VPS Dev héberge l'environnement de développement et de test de la plateforme Otobot.

### **PostgreSQL (Le Coffre-fort)**

* Stocke tous les credentials (tokens, clés API) de manière chiffrée.
* Gère les utilisateurs, leurs connexions OAuth et les journaux d'accès pour l'audit.
* Agit comme le coffre-fort numérique inviolable du système.
* Gère 3 bases de données : `otobot_n8n`, `otobot_frontend`, `otobot_tooljet`

### **API Interne (Le Gardien) - Port 3001**

* Constitue le seul point d'accès autorisé aux credentials.
* Authentifie chaque requête provenant des autres services (comme N8N) via un token secret.
* Déchiffre les credentials "à la volée" uniquement lorsque c'est nécessaire.
* Gère le flux OAuth2 pour la connexion des utilisateurs aux services tiers.
* Logue absolument tous les accès pour un audit complet.
* Expose des endpoints spécifiques pour N8N, ToolJet et OAuth

### **N8N (L'Orchestrateur) - Port 5678**

* Exécute les workflows d'automatisation.
* Utilise un nœud personnalisé ("Otobot Credential Fetcher") pour demander les credentials à l'API interne.
* Ne stocke jamais directement les credentials, les utilisant uniquement en mémoire le temps de l'exécution.
* Est conçu pour fonctionner dans un contexte multi-utilisateurs.
* Intègre des nodes personnalisés via le dossier `/home/node/.n8n/custom`

### **ToolJet (L'Interface Client) - Port 8082**

* Fournit l'interface web pour les utilisateurs finaux.
* Permet aux utilisateurs de gérer leurs connexions aux services (connexion, déconnexion).
* Sert à déclencher manuellement des workflows N8N.
* Affiche des tableaux de bord et les informations relatives aux services souscrits.
* Gestion des sources de curation de contenu

### **Token Refresher (Service de Maintenance)**

* Service cron qui vérifie toutes les 30 minutes les tokens expirés
* Rafraîchit automatiquement les tokens OAuth2 quand c'est possible
* Logue les erreurs de refresh pour notification

### **Nginx (Reverse Proxy) - Ports 80/443**

* Profile "production" uniquement
* Gère le SSL/TLS pour tous les services
* Route les requêtes vers les bons services internes

### **LibreChat (L'Interface de Chat)**

* Interface web moderne pour interagir avec l'IA
* Connectée à Ollama via l'endpoint sécurisé
* Support multi-modèles avec sélection dynamique
* Accessible sur le port 3080 (via port forwarding SSH pour le développement)

### **MongoDB**

* Base de données pour LibreChat
* Stockage des conversations et préférences utilisateurs



## Serveurs "Client"

Chaque client dispose d'un VPS dédié avec la même architecture que le VPS Dev, configuré spécifiquement pour ses besoins :

* Configuration personnalisée des workflows N8N
* Base de données isolée
* Connexions OAuth spécifiques au client
* Accès sécurisé au serveur IA Interne mutualisé

# Gestion du projet via GITHUB

L'ensemble de la solution est réalisée au sein d'un dépot Github :

[github.com/Nico-35/Otobotproject](https://github.com/Nico-35/Otobotproject)

Structure du dépôt :

```
Otobotproject/
├── .github/workflows/          # CI/CD pipelines
├── api-internal/              # Code source de l'API interne
├── clients/                   # Configurations spécifiques par client
├── n8n-custom/               # Nodes et credentials personnalisés N8N
├── nginx/                    # Configuration Nginx et certificats SSL
├── sql/                      # Scripts de création des bases de données
├── templates/                # Templates de workflows
├── docker-compose.yml        # Configuration Docker principale
├── .env.example             # Template des variables d'environnement
├── tooljet.env.example      # Template pour ToolJet
└── clients-config.json      # Manifeste des configurations clients
```

# Documentation de la solution

## Docker

L'ensemble de la solution Otobot est conteneurisée avec Docker pour garantir la portabilité, l'isolation et la facilité de déploiement.

### **Services Docker - VPS DEV**

#### **docker-compose.yml **

```yaml
services:
  postgres:          # Base de données principale
  n8n:              # Moteur d'automatisation
  api-internal:     # API de gestion des credentials
  token-refresher:  # Service de refresh automatique
  tooljet:          # Interface client
  nginx:            # Reverse proxy (profile production)
  mongo:            # Base pour LibreChat (profile librechat)
  librechat:        # Interface chat IA (profile librechat)
```

#### **Volumes persistants**

* `postgres_data`: Données PostgreSQL
* `n8n_data`: Workflows et configuration N8N
* `tooljet_data`: Données ToolJet
* `mongodb_data`: Données MongoDB
* `librechat_images` et `librechat_plugins`: Assets LibreChat

#### **Réseaux**

* `otobot_backend_network`: Réseau interne isolé pour la communication entre services

### **Services Docker - Serveur IA Interne**

#### **docker-compose.yml **

```yaml
services:
  ollama:           # Moteur IA avec support GPU
```

#### **Configuration GPU**

Utilisation du NVIDIA Container Toolkit pour l'accès GPU depuis les conteneurs Docker.

## Postgres

PostgreSQL est le système de gestion de base de données principal de la solution Otobot.

### **Bases de données**

#### **1. otobot_n8n**

* Base dédiée à N8N
* Stockage des workflows, exécutions, credentials N8N natifs

#### **2. otobot_frontend**

* Base principale pour l'API et le système de gestion des credentials
* Tables principales :
  * `users`: Utilisateurs multi-tenants
  * `clients`: Entreprises clientes
  * `client_connections`: Connexions OAuth chiffrées
  * `services`: Services disponibles (Google, Notion, etc.)
  * `oauth_applications`: Applications OAuth configurées
  * `curation_sources`: Sources de veille configurées
  * `credential_access_logs`: Audit des accès

#### **3. otobot_tooljet**

* Base dédiée à ToolJet
* Gestion des applications, queries, et données utilisateurs ToolJet

### **Sécurité**

* Extension `pgcrypto` pour le chiffrement AES-256
* Fonctions PL/pgSQL pour la gestion sécurisée des credentials
* Isolation complète entre les bases de données

## N8N

N8N est le moteur d'automatisation au cœur de la solution Otobot.

### **Configuration**

* Version : 1.41.1 (fixée pour la stabilité)
* Port : 5678
* Base de données : PostgreSQL
* Authentification : JWT avec gestion multi-utilisateurs

### **Nodes personnalisés**

#### **OtobotCredentialFetcher**

Node custom permettant de récupérer dynamiquement les credentials depuis l'API interne.

#### **OtobotDatabaseCredential**

Type de credential personnalisé pour la connexion à l'API interne.

### **Intégration**

* Montage du dossier `/n8n-custom` pour les nodes personnalisés
* Communication avec l'API interne via le réseau Docker interne
* Support complet du multi-utilisateurs avec isolation des données

## Tooljet

ToolJet est l'interface client low-code de la solution Otobot.

### **Configuration**

* Version : v2.33.0
* Port : 8082
* Base de données : PostgreSQL (base dédiée)
* Authentification : JWT avec sessions

### **Fonctionnalités principales**

* Dashboard personnalisé par client
* Gestion des connexions OAuth (interface visuelle)
* Déclenchement manuel des workflows N8N
* Visualisation des services souscrits
* Gestion des sources de curation de contenu

### **Intégration**

* Communication avec l'API interne via REST API datasource
* Support du multi-utilisateurs avec contexte utilisateur
* Variables globales pour l'authentification

### **Intégration N8N & ToolJet**

#### **Déclencher un Workflow N8N depuis ToolJet**

Créez une `Query` dans ToolJet pour appeler le webhook de votre workflow N8N.

```javascript
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

#### **Recevoir des Mises à Jour de N8N dans ToolJet**

Pour informer ToolJet de la fin d'un workflow, utilisez un nœud `HTTP Request` à la fin de votre workflow N8N pour appeler un webhook exposé par ToolJet.

```javascript
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

------

#

## Sécurité et Gestion des Données

#### **Principe de Sécurité Fondamental**

Le concept clé à comprendre est que **les credentials des services externes (Google, Notion, Microsoft...) ne sont JAMAIS stockés dans N8N**. Ils sont :

1. **Stockés** dans la base de données PostgreSQL, chiffrés avec l'algorithme AES-256-GCM.
2. **Gérés** par une API interne qui agit comme unique point de contrôle d'accès.
3. **Récupérés** dynamiquement par N8N via un nœud personnalisé au moment de l'exécution du workflow.
4. **Associés** à des utilisateurs spécifiques pour garantir une isolation parfaite (multi-utilisateurs).

### **Le Système de Chiffrement (Le Coffre-fort)**

#### **Pourquoi un chiffrement fort ?**

Stocker des tokens d'accès en clair, c'est comme laisser les clés de sa maison sous le paillasson. Notre système agit comme un coffre-fort de banque avec un gardien. Le coffre-fort est le **chiffrement**, et le gardien est l'**API**.

#### **Les Composants du Chiffrement : AES-256-GCM**

Notre système utilise l'algorithme **AES-256-GCM**, un standard adopté par les gouvernements et les institutions financières.

* **AES (Advanced Encryption Standard)** : C'est l'algorithme de chiffrement lui-même, réputé pour sa robustesse.
* **256** : Indique la taille de la clé de chiffrement en bits. Une clé de 256 bits offre un nombre de combinaisons astronomique (2^256), la rendant impossible à forcer par brute-force.
* **GCM (Galois/Counter Mode)** : C'est un mode d'opération qui non seulement chiffre les données, mais garantit aussi leur **authenticité** et leur **intégrité**. Il produit un "tag d'authentification" qui agit comme un sceau de cire : si la donnée chiffrée est modifiée, le sceau est brisé et le déchiffrement échoue.

#### **Les Éléments Clés du Processus**

1. La Clé de Chiffrement Maîtresse (ENCRYPTION_MASTER_KEY)
   * Une chaîne de 64 caractères hexadécimaux (32 bytes) définie dans le fichier `.env`.
   * Exemple : `a7f3b2c8d9e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0`.
   * **C'est l'élément le plus critique du système.** Sans cette clé, toutes les données chiffrées sont définitivement perdues. Elle ne doit jamais être partagée ou stockée dans un endroit non sécurisé.
2. Le Vecteur d'Initialisation (IV)
   * Un nombre aléatoire unique généré pour *chaque* opération de chiffrement.
   * Il garantit que si l'on chiffre deux fois la même donnée (ex: le même token), le résultat sera différent à chaque fois. Cela empêche les attaques par reconnaissance de motifs.
   * L'IV n'est pas secret et est stocké avec la donnée chiffrée.
3. Le Tag d'Authentification (Auth Tag)
   * Une signature cryptographique générée par le mode GCM.
   * Il est vérifié lors du déchiffrement pour s'assurer que la donnée n'a pas été altérée depuis son chiffrement.

#### **Le Processus de Chiffrement et de Déchiffrement**

**Processus de Chiffrement :**

```bash
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Donnée Claire  │────▶│   Chiffrement   │────▶│ Donnée Chiffrée │
│ "Token123..."   │     │   + Clé + IV    │     │  "x9$mK#2@..."  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

Ce qui est réellement stocké en base de données est une chaîne unique qui combine tous les éléments nécessaires au déchiffrement (sauf la clé maîtresse) : version:iv:authTag:donnée_chiffrée Exemple : 1:f3a2b5c8d9e4f5a6b7:9d8e7f6a5b4c3d2e:x9$mK#2@pL9b7n5... Processus de Déchiffrement : L'API effectue l'opération inverse. Elle reçoit la chaîne de la base de données, la décompose en ses différents éléments, utilise la clé maîtresse secrète pour déchiffrer la donnée, et vérifie que le tag d'authentification est valide.

```
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

### **L'API Interne (Le Gardien)**

#### **Architecture de l'API**

L'API est conçue avec plusieurs couches de sécurité qui agissent comme des filtres successifs pour chaque requête reçue.

```
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

##### **Couche 1 : Authentification**

Chaque service interne (comme N8N) qui souhaite communiquer avec l'API doit présenter un "badge d'accès" secret dans les en-têtes de sa requête. JavaScript

```javascript
// Requête de N8N vers l'API
headers: {
  'x-internal-token': 'votre-token-secret-partagé-via-env'
}
```

Si le token est manquant ou invalide, la requête est immédiatement rejetée avec une erreur `401 Unauthorized`.

##### **Couche 2 : Validation**

L'API vérifie que les paramètres fournis dans la requête sont valides et conformes au format attendu (ex: un `userId` doit être un UUID valide, un `serviceName` doit être une valeur connue). Cela empêche les requêtes malformées et certaines formes d'injection.

##### **Couche 3 : Rate Limiting (Limitation de débit)**

Pour prévenir les abus ou les attaques par déni de service, l'API limite le nombre de requêtes qu'un client peut effectuer sur une période donnée (ex: 100 requêtes par 15 minutes). Si la limite est dépassée, l'API répond avec une erreur `429 Too Many Requests`.

#### **Le Parcours Complet d'une Donnée**

**Scénario : Un utilisateur connecte son compte Google via l'interface ToolJet.**

1. Phase 1 : Obtention du token
   * L'utilisateur clique sur "Connecter mon compte Google" dans ToolJet.
   * Il est redirigé vers la page d'autorisation de Google.
   * Après autorisation, Google le redirige vers l'API Otobot avec un code d'autorisation.
2. Phase 2 : Stockage sécurisé
   * L'API Otobot reçoit le code et l'échange contre un `access_token` et un `refresh_token` auprès de Google.
   * L'API **chiffre immédiatement** ces deux tokens en utilisant la clé maîtresse.
   * Les tokens chiffrés sont stockés dans la table `client_connections` de la base de données, associés à l'ID de l'utilisateur.
3. Phase 3 : Utilisation dans un workflow N8N
   * Un workflow N8N est déclenché pour cet utilisateur.
   * Le nœud "Otobot Credential Fetcher" effectue une requête vers l'API : `GET /api/internal/user/USER_ID/credentials/google` avec le token d'authentification interne.
   * L'API vérifie le token, valide les paramètres, récupère les tokens chiffrés de la base de données.
   * Elle **déchiffre** l'`access_token` et le renvoie à N8N dans sa réponse.
   * N8N reçoit le token en clair, l'utilise pour appeler l'API de Google, puis le détruit de sa mémoire à la fin du workflow.

### **Le Système Multi-Utilisateurs et la Gestion du Contexte**

#### **Hiérarchie des Données**

Le système est conçu pour être multi-tenant, avec une hiérarchie claire :

```scss
Client (Entreprise)
  └── Users (Utilisateurs individuels)
       └── Connections (Connexions aux services : "Mon compte Google Pro", "Mon compte Slack perso")
            └── Credentials (Les tokens chiffrés pour chaque connexion)
```

Cette structure garantit qu'un utilisateur A ne pourra jamais accéder aux connexions de l'utilisateur B, même s'ils appartiennent à la même entreprise.

#### **Implication : Chaque Workflow doit Connaître son Utilisateur**

Puisque les credentials sont liés à un utilisateur spécifique, chaque exécution de workflow doit impérativement savoir **pour quel utilisateur** elle s'exécute. **Solution recommandée : Webhook avec contexte utilisateur**

1. **Déclenchement par Webhook** : Le point d'entrée de la plupart des workflows est un nœud Webhook.
2. **Contexte transmis par le déclencheur (ToolJet)** : L'application front-end (ToolJet) qui déclenche le workflow doit inclure l'identifiant de l'utilisateur dans le corps de la requête.
3. **Propagation du contexte** : L'ID de l'utilisateur est ensuite passé en paramètre à chaque nœud du workflow qui en a besoin, notamment au nœud "Otobot Credential Fetcher".

##### **Exemple : Déclenchement par ToolJet**

Voici comment ToolJet déclenche un workflow N8N en passant le contexte utilisateur : JavaScript

```javascript
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

##### **Exemple : Workflow N8N recevant le contexte**

Le workflow N8N est structuré pour recevoir et valider ce contexte. JSON

```json
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



### **Le Nœud N8N Personnalisé : "Otobot Credential Fetcher"**

Le cœur de l'intégration entre N8N et le système de gestion des credentials est le nœud personnalisé `otobotCredentialFetcher`.

#### **Opérations disponibles**

Le nœud propose plusieurs opérations :

1. **Get User Credentials**: Récupère les tokens pour un utilisateur et un service spécifique. C'est l'opération la plus courante.
2. **List User Connections**: Liste toutes les connexions actives d'un utilisateur (ex: pour savoir si un utilisateur a connecté son compte Google).
3. **Check Connection Status**: Vérifie la validité d'une connexion spécifique (ex: si un token est expiré).

#### **Exemple d'utilisation : Récupérer un token Notion**

JavaScript

```javascript
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

### **Développement de Workflows N8N : Patrons et Bonnes Pratiques**

#### **Le Patron de Base d'un Workflow Sécurisé**

```
Webhook Trigger -> IF (Valider Input) -> Otobot Credential Fetcher -> HTTP Request (Appel API externe) -> IF (Gestion Erreur) -> Respond to Webhook
```

#### **Bonnes Pratiques Essentielles**

* ✅ **TOUJOURS** utiliser une variable dynamique pour l'ID utilisateur (`{{$json.body.userId}}`). Ne jamais coder en dur un ID.
* ✅ **TOUJOURS** sécuriser vos webhooks (via Header Auth et un secret partagé).
* ✅ **TOUJOURS** implémenter une gestion des erreurs robuste, notamment pour les cas où les credentials ne sont pas trouvés ou sont expirés.
* ✅ **TOUJOURS** logger les actions sensibles et les erreurs dans une base de données ou un service de logging.
* ❌ **JAMAIS** stocker des credentials en dur dans les workflows N8N.
* ❌ **JAMAIS** logger des tokens ou des données sensibles en clair.

#### **Gestion des Erreurs Courantes**

* **Connection not found (404)** : Le nœud Otobot renverra `{"error": "Connection not found", "hasCredentials": false}`. Utilisez un nœud `IF` pour détecter ce cas et notifier l'utilisateur qu'il doit connecter son service.
* **Token expiré (erreur 401 de l'API externe)** : Implémentez un bloc `Try/Catch`. Si une erreur 401 survient, utilisez le nœud Otobot avec l'opération `Check Connection Status` pour confirmer l'expiration, puis notifiez l'utilisateur.
* **Rate Limiting (erreur 429 de l'API externe)** : Dans votre gestion d'erreur, ajoutez un nœud `Wait` avec un délai exponentiel (backoff) avant de réessayer l'appel un nombre limité de fois.

### **Exemples de Workflows N8N Complets**

#### **Workflow 1 : Synchronisation Google Drive vers Notion**

Ce workflow est déclenché par un webhook, récupère les credentials Google et Notion pour un utilisateur, liste les nouveaux fichiers sur Drive, et crée des pages correspondantes dans une base de données Notion. Le JSON complet de ce workflow se trouve dans le document [otobot-doc-complete.md](http://otobot-doc-complete.md/).

#### **Workflow 2 : Notification Multi-Canal**

Ce workflow récupère la liste des connexions d'un utilisateur, et en fonction des services actifs (Google, Slack), envoie une notification par email et/ou sur un canal Slack. Le JSON complet de ce workflow se trouve dans le document [otobot-doc-complete.md](http://otobot-doc-complete.md/).

#### **Workflow 3 : Maintenance Automatique des Tokens**

Ce workflow s'exécute quotidiennement (via un nœud Cron), parcourt tous les utilisateurs, vérifie la date d'expiration de leurs connexions, et envoie une alerte par email si une reconnexion est bientôt nécessaire. Le JSON complet de ce workflow se trouve dans le document [otobot-doc-complete.md](http://otobot-doc-complete.md/).

#

------

## Ollama

Ollama est le moteur d'IA local utilisé sur le serveur IA Interne pour l'exécution des Large Language Models (LLM).

### **Caractéristiques principales**

* **Multi-modèles** : Support de plusieurs modèles (Mistral, Llama3, Gemma, etc.)
* **Gestion GPU** : Utilisation optimale du GPU NVIDIA pour l'inférence
* **API Compatible OpenAI** : Expose une API compatible avec le standard OpenAI
* **Hot-swapping** : Changement automatique de modèle en mémoire selon les requêtes

### **Installation avec support GPU**

#### **Prérequis GPU**

```bash
# Installation des drivers NVIDIA
sudo apt install nvidia-driver-570-server
sudo reboot

# Vérification
nvidia-smi

# Installation du NVIDIA Container Toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
# ... (configuration du repository et installation)
```

#### **Configuration Docker**

```yaml
version: '3.8'
services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

### **Gestion des modèles**

#### **Téléchargement de modèles**

```bash
# Télécharger un modèle
docker exec ollama ollama pull mistral:7b-instruct
docker exec ollama ollama pull llama3:8b-instruct
docker exec ollama ollama pull gemma:7b-instruct

# Lister les modèles disponibles
docker exec ollama ollama list
```

#### **Utilisation**

* Les modèles sont automatiquement chargés/déchargés de la VRAM selon les requêtes
* Un seul modèle actif en mémoire à la fois pour optimiser l'utilisation GPU
* Temps de changement de modèle : quelques secondes

### **Intégration avec Caddy**

Pour sécuriser l'accès à Ollama, un reverse proxy Caddy est configuré :

```
ia.otobot.fr {
    log {
        output file /var/log/caddy/ia.otobot.fr.log
    }

    @unauthorized {
        not header Authorization "Bearer VOTRE_CLE_API_SECRETE"
    }
    respond @unauthorized "Unauthorized" 401

    reverse_proxy localhost:11434
}
```

Cela permet :

* Chiffrement HTTPS automatique via Let's Encrypt
* Authentification par clé API
* Logs d'accès centralisés

## LibreChat

LibreChat est l'interface de chat moderne utilisée pour interagir avec l'IA souveraine Otobot.

### **Architecture**

LibreChat est déployé sur le serveur "**VPS DEV**", dans le répertoire /home/ubuntu/LibreChat

### **Configuration**

#### **Variables d'environnement (.env)**

```env
HOST=0.0.0.0
MONGO_URI=mongodb://mongo:27017/LibreChat
DOMAIN_CLIENT=http://localhost:3080
DOMAIN_SERVER=http://localhost:3080

# Clé API pour l'accès à Ollama
OLLAMA_API_KEY=VOTRE_CLE_API_SECRETE
```

#### **Configuration des endpoints (librechat.yaml)**

```yaml
endpoints:
  custom:
    - name: "IA Interne OTOBOT"
      apiKey: "${OLLAMA_API_KEY}"
      baseURL: "https://ia.otobot.fr/v1"
      models:
        default: ["mistral:7b-instruct","gemma:7b-instruct", "deepseek-r1:14b","gemma2:27b"]
        fetch: false # Pas besoin de découvrir les modèles, nous spécifions celui que nous voulons
      titleConvo: true
      titleModel: "mistral:7b-instruct"
      modelDisplayLabel: "IA Interne OTOBOT"
```

* **Multi-modèles** : Sélection dynamique entre les modèles disponibles
* **Historique des conversations** : Stockage persistant dans MongoDB
* **Interface moderne** : UI/UX intuitive et responsive
* **Sécurité** : Communication chiffrée avec l'API Ollama via HTTPS

### **Utilisation**

1. Accès via navigateur : `http://IP_VPS:3080` ou via port forwarding SSH
2. Création d'un compte utilisateur (le premier devient admin)
3. Sélection du modèle souhaité dans l'interface
4. Interaction en langage naturel avec l'IA

# Paramétrage serveur "VPS Dev"

Ce guide décrit le déploiement de la solution complète sur un serveur VPS.

## **Installations de base**

### **Prérequis**

* Un serveur VPS avec Ubuntu 22.04+ (au moins 4GB de RAM recommandés).
* Accès root ou un utilisateur avec des privilèges `sudo`.
* Un terminal SSH.

### **Mise à jour du système**

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nano wget
```

### **Configuration du pare-feu (UFW)**

```bash
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

### **Installation de Docker et Docker Compose**

```bash
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

## **Installation du Projet (Github)**

### **Clonage du Repository**

```bash
# Naviguer vers le répertoire de base de l'utilisateur
cd ~

# Cloner le projet depuis votre repository Git
git clone git@github.com:votre-org/Otobotproject.git
cd Otobotproject
```

Le clonage du repository va recréer l'ensemble de la solution. Le fichier Docker Compose ainsi téléchargé va permettre de démarrer tous les conteneurs de la solution.

### **Création des fichiers de configuration**

Les configurations sensibles sont stockées dans des fichiers `.env` qui ne sont pas versionnés dans Git. Il faut donc recréer un fichier .env propre à chaque serveur VPS.

```bash
# Copier les fichiers d'exemple pour créer vos propres fichiers de configuration
cp .env.example .env
cp tooljet.env.example tooljet.env
```

### **Génération des Secrets**

Cette phase est **critique** pour la sécurité de votre déploiement.

#### **3.1 Génération des Mots de Passe et Clés**

Utilisez les commandes suivantes pour générer des secrets robustes. **Stockez ces valeurs dans un gestionnaire de mots de passe sécurisé.**

```bash
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
openssl rand -hex 32      # Pour TOOLJET_ENCRYPTION_KEY et LOCKBOX_MASTER_KEY
openssl rand -base64 48   # Pour TOOLJET_JWT_SECRET
```

#### **3.2 Configuration du fichier** **`.env`**

Ouvrez le fichier `.env` (`nano .env`) et remplissez-le avec les valeurs que vous venez de générer.

```env
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
LOCKBOX_MASTER_KEY=[VALEUR 9 - même que TOOLJET_ENCRYPTION_KEY]
TOOLJET_SECRET_KEY_BASE=[VALEUR 8]
TOOLJET_ENCRYPTION_KEY=[VALEUR 9]
TOOLJET_JWT_SECRET=[VALEUR 10]
```

#### **3.3 Configuration du fichier** **`tooljet.env`**

Ouvrez le fichier `tooljet.env` (`nano tooljet.env`) et configurez l'URL de la base de données.

```env
# Le mot de passe [VALEUR 3] doit être le même que dans le fichier .env principal
DATABASE_URL=postgresql://tooljet_user:[VALEUR 3]@postgres:5432/otobot_tooljet?sslmode=disable
PG_SSL=false
PORT=8082
```

### **Installation & paramétrage POSTGRES**

#### **4.1 Lancement du service PostgreSQL**

```bash
# Démarrer uniquement le conteneur PostgreSQL
docker compose up -d postgres

# Attendre environ 30 secondes que le service soit pleinement initialisé
sleep 30

# Vérifier les logs pour confirmer que la base de données est prête
docker compose logs postgres
```

#### **4.2 Création des Bases de Données et des Utilisateurs**

```bash
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

#### **4.3 Exécution des scripts de création de tables**

```bash
# Exécuter le script SQL pour créer le schéma de la base de l'API
docker exec -i otobot_postgres_db psql -U frontend_user -d otobot_frontend < sql/create-frontend-database.sql

# Exécuter les migrations multi-utilisateurs et OAuth
docker exec -i otobot_postgres_db psql -U frontend_user -d otobot_frontend < sql/multi-users-migration.sql
docker exec -i otobot_postgres_db psql -U frontend_user -d otobot_frontend < sql/oauth-apps-schema.sql
docker exec -i otobot_postgres_db psql -U frontend_user -d otobot_frontend < sql/curation-sources-schema.sql
```

### **Phase 5 : Déploiement des Applications**

#### **5.1 Installation des dépendances et construction des images**

```bash
# Installer les dépendances pour l'API (si elles ne sont pas gérées dans le Dockerfile)
cd api-internal && npm install --production && cd ..

# Installer les dépendances pour les nodes N8N personnalisés
cd n8n-custom && npm install && npm run build && cd ..

# Construire les images Docker pour les services personnalisés
docker compose build api-internal token-refresher
```

#### **5.2 Lancement de toute la stack**

```bash
# Lancer tous les services définis dans docker-compose.yml
docker compose --profile api --profile frontend up -d

# Pour ajouter LibreChat (optionnel)
docker compose --profile api --profile frontend --profile librechat up -d

# Vérifier que tous les conteneurs sont en cours d'exécution et en bonne santé
docker compose ps
```

### **Phase 6 : Configuration Initiale des Services**

#### **6.1 Configuration de N8N**

1. Accédez à l'URL de votre N8N (ex: `http://IP_DU_VPS:5678`).
2. Créez le compte propriétaire (administrateur).
3. Naviguez dans `Credentials` -> `New`.
4. Créez une nouvelle credential de type `Otobot Database Connection` (ce type est disponible grâce aux nœuds personnalisés).
5. Remplissez les champs :
   * **Credential Name**: `Otobot API Connection`
   * **Client ID**: L'ID du client (UUID) - sera fourni après création du client test
   * **API Interne URL**: `http://api-internal:3001` (nom du service Docker)
   * **Token Interne**: La valeur de `N8N_INTERNAL_TOKEN` de votre fichier `.env`.

#### **6.2 Configuration de ToolJet**

1. Accédez à l'URL de votre ToolJet (ex: `http://IP_DU_VPS:8082`).

2. Créez le compte administrateur.

3. Naviguez dans `Data Sources` et créez une nouvelle source de type `REST API`.

4. Configurez-la comme suit :

   * **Name**: `Otobot API Internal`

   * **URL**: `http://api-internal:3001`

   * Headers

     :

     * `Content-Type`: `application/json`
     * `x-internal-token`: `{{globals.n8nInternalToken}}` (à définir dans les variables globales)

### **Phase 7 : Validation Complète du Système**

#### **7.1 Tests de santé des services**

```bash
# Tester la disponibilité de l'API interne
curl http://localhost:3001/health
# Attendu: {"status":"ok", "service":"otobot-internal-api", ...}

# Tester N8N (devrait retourner une redirection vers la page de login)
curl -I http://localhost:5678

# Tester ToolJet
curl -I http://localhost:8082
```

#### **7.2 Création d'un client de test pour un test de bout en bout**

```bash
# 1. Générer un hash de mot de passe pour le client de test
HASH=$(docker compose exec api-internal node -e "const bcrypt = require('bcrypt'); bcrypt.hash('Test123!', 10).then(hash => console.log(hash));")

# 2. Insérer le client et l'utilisateur admin dans la base de données
docker exec otobot_postgres_db psql -U frontend_user -d otobot_frontend << EOF
-- Créer le client
INSERT INTO clients (email, company_name, password_hash) 
VALUES ('test@otobot.fr', 'Entreprise Test', '$HASH')
RETURNING id;

-- Créer l'utilisateur admin (récupérer l'ID client depuis la requête précédente)
INSERT INTO users (client_id, email, password_hash, role) 
SELECT id, 'test@otobot.fr', '$HASH', 'admin' 
FROM clients 
WHERE email = 'test@otobot.fr';
EOF

# 3. Tester la connexion via l'API
curl -X POST http://localhost:3001/api/tooljet/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@otobot.fr","password":"Test123!"}'
# Attendu: Une réponse JSON contenant un authToken (JWT).
```

------

# Paramétrage serveur "IA Interne" (OVH L4 90)

Le serveur IA Interne est un serveur haute performance dédié à l'exécution de modèles d'IA avec support GPU.

### **Spécifications matérielles**

* Serveur OVH L4 90
* GPU NVIDIA (pour l'accélération de l'inférence)
* Au moins 32GB RAM recommandé
* Stockage SSD rapide pour les modèles

### **Installation de base**

#### **1. Docker avec support GPU**

Suivre la procédure décrite dans "Serveur IA Interne L4 90 - 1. Docker" :

```bash
# Mise à jour système
sudo apt update && sudo apt upgrade -y

# Installation Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Installation des drivers NVIDIA
sudo apt install nvidia-driver-570-server
sudo reboot

# Vérification GPU
nvidia-smi

# Installation NVIDIA Container Toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
# ... (suite de l'installation)

sudo systemctl restart docker
```

#### **2. Ollama**

Déploiement d'Ollama avec support GPU :

```bash
# Créer le répertoire du projet
cd ~
mkdir llm_souverain && cd llm_souverain

# Créer docker-compose.yml
nano docker-compose.yml
```

Contenu du docker-compose.yml :

```yaml
version: '3.8'
services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

volumes:
  ollama_data:
    driver: local
# Lancer Ollama
docker compose up -d

# Télécharger les modèles
docker exec ollama ollama pull mistral:7b-instruct
docker exec ollama ollama pull llama3:8b-instruct
docker exec ollama ollama pull gemma:7b-instruct

# Vérifier les modèles installés
docker exec ollama ollama list
```

#### **3. Accès externe sécurisé avec Caddy**

Configuration du reverse proxy avec authentification :

```bash
# Installation de Caddy
sudo apt install -y debian-keyring debian-archive-keyring gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Générer une clé API
head -c 32 /dev/urandom | base64

# Configurer Caddy
sudo nano /etc/caddy/Caddyfile
```

Configuration Caddyfile :

```
ia.otobot.fr {
    log {
        output file /var/log/caddy/ia.otobot.fr.log
    }

    @unauthorized {
        not header Authorization "Bearer VOTRE_CLE_API_SECRETE"
    }
    respond @unauthorized "Unauthorized" 401

    reverse_proxy localhost:11434
}
# Recharger Caddy
sudo systemctl reload caddy

# Configurer le pare-feu
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 11434/tcp
sudo ufw enable
```

#### **4. LibreChat**

Installation de LibreChat pour une interface de chat :

```bash
# Cloner LibreChat
cd ~
git clone https://github.com/danny-avila/LibreChat.git
cd ~/LibreChat

# Créer le fichier .env
cp .env.example .env
nano .env
```

Configuration minimale dans .env :

```env
HOST=0.0.0.0
MONGO_URI=mongodb://mongo:27017/LibreChat
DOMAIN_CLIENT=http://localhost:3080
DOMAIN_SERVER=http://localhost:3080

# Clé API pour Ollama
OLLAMA_API_KEY=VOTRE_CLE_API_DE_CADDY
```

Créer librechat.yaml :

```yaml
version: 1.2.8
endpoints:
  custom:
    - name: "IA Souveraine Otobot"
      apiKey: "${OLLAMA_API_KEY}"
      baseURL: "https://ia.otobot.fr/v1"
      models:
        default: ["mistral:7b-instruct", "llama3:8b-instruct", "gemma:7b-instruct"]
        fetch: false
      titleConvo: true
      titleModel: "mistral:7b-instruct"
      modelDisplayLabel: "Modèle IA Souverain"
```

Intégrer à la stack Docker du serveur IA :

```yaml
# Ajouter au docker-compose.yml existant
  mongo:
    image: mongo:latest
    container_name: mongo
    restart: always
    volumes:
      - mongodb_data:/data/db

  librechat:
    image: ghcr.io/danny-avila/librechat:latest
    container_name: librechat
    restart: always
    ports:
      - "3080:3080"
    volumes:
      - ../LibreChat/librechat.yaml:/app/librechat.yaml
      - librechat_images:/app/client/public/images
      - librechat_plugins:/app/client/public/plugins
    depends_on:
      - mongo
    env_file:
      - ../LibreChat/.env

volumes:
  mongodb_data:
  librechat_images:
  librechat_plugins:
# Relancer avec LibreChat
docker compose up -d
```

### **Choix et gestion des modèles**

#### **Téléchargement de modèles supplémentaires**

Les modèles peuvent être téléchargés à la demande :

```bash
# Télécharger un nouveau modèle
docker exec ollama ollama pull nom-du-modele:tag

# Exemples de modèles disponibles
docker exec ollama ollama pull mistral:7b-instruct-v0.2
docker exec ollama ollama pull codellama:13b
docker exec ollama ollama pull mixtral:8x7b
```

#### **Gestion automatique de la mémoire**

* Ollama gère automatiquement le chargement/déchargement des modèles
* Un seul modèle actif en VRAM à la fois
* Le changement de modèle se fait automatiquement selon les requêtes
* Temps de changement : 5-15 secondes selon la taille du modèle

#### **Configuration dans LibreChat**

Pour ajouter de nouveaux modèles dans LibreChat, éditer librechat.yaml :

```yaml
models:
  default: [
    "mistral:7b-instruct",
    "llama3:8b-instruct", 
    "gemma:7b-instruct",
    "codellama:13b",
    "mixtral:8x7b"
  ]
```

Puis redémarrer LibreChat :

```bash
docker compose restart librechat
```

# Maintenance, Supervision et Sécurité du Système

## **Sécurité en Profondeur**

La sécurité est une superposition de plusieurs couches de défense.

* Niveau 1 : Protection Physique et Réseau
  * Serveur hébergé en France (OVH).
  * Accès SSH par clé uniquement.
  * Pare-feu (UFW) limitant les ports ouverts.
  * Réseau Docker interne isolant les services les uns des autres.
* Niveau 2 : Protection Applicative
  * **Authentification** : Toutes les communications inter-services (N8N -> API) sont authentifiées par un token secret.
  * **Validation** : Validation systématique des entrées pour se prémunir contre les injections.
  * **Rate Limiting** : Protection contre les attaques par force brute ou déni de service.
* Niveau 3 : Protection des Données
  * **Chiffrement** : Utilisation de AES-256-GCM pour toutes les données sensibles au repos.
  * **Gestion des Clés** : La `ENCRYPTION_MASTER_KEY` est stockée uniquement dans une variable d'environnement, jamais dans le code ou la base de données.
  * **Principe du moindre privilège** : Chaque composant n'a que les droits strictement nécessaires à son fonctionnement.
  * **Audit** : Journalisation de tous les accès aux credentials.

## **Maintenance, Supervision et Dépannage**

### **Commandes de Maintenance Quotidienne**

```bash
# 1. Vérifier l'état de tous les services Docker
docker compose ps

# 2. Consulter les logs récents de l'API à la recherche d'erreurs
docker compose logs api-internal --tail=100 | grep -i "error"

# 3. Vérifier l'état de santé de l'API
curl http://localhost:3001/health

# 4. Lancer le script de diagnostic complet (voir ci-dessous)
~/check-otobot.sh

# 5. Surveiller les tokens expirés
docker exec -it otobot_api_internal node monitor-tokens.js

# 6. Mode surveillance continue
docker exec -it otobot_api_internal node monitor-tokens.js --watch
```

### **Sauvegardes Automatiques**

Il est **critique** de mettre en place des sauvegardes régulières.

1. **Script de sauvegarde automatique** :

```bash
#!/bin/bash
# ~/backup-otobot.sh
BACKUP_DIR="/home/ubuntu/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker exec otobot_postgres_db pg_dumpall -U otobot_admin > $BACKUP_DIR/postgres_full.sql

# Backup volumes
for volume in n8n_data tooljet_data postgres_data mongodb_data librechat_images; do
  docker run --rm -v otobot_$volume:/data -v $BACKUP_DIR:/backup \
    alpine tar -czf /backup/${volume}.tar.gz -C /data .
done

# Garder seulement les 7 derniers jours
find /home/ubuntu/backups -type d -mtime +7 -exec rm -rf {} \;
```

1. **Configuration cron** :

```bash
# Ajouter au crontab
crontab -e
# Ajouter : 0 2 * * * /home/ubuntu/backup-otobot.sh
```

### **Script de Diagnostic Automatique**

Un script complet (`check-otobot.sh` fourni dans le document `2025-06-04-Documentation complète Tooljet Frontend v3.md`) permet de vérifier tous les points critiques de l'installation : services Docker, ports, variables d'environnement, connexion à la base de données, etc. Il est recommandé de l'utiliser pour tout dépannage initial.

### **Dépannage des Problèmes Courants**

Le document `2025-06-04...` contient une section de dépannage très détaillée couvrant des problèmes comme :

* "Cannot connect to the Docker daemon"
* "ENCRYPTION_MASTER_KEY must be 32 bytes"
* ToolJet bloqué au démarrage
* "password authentication failed for user"
* Ports déjà utilisés
* "Client not found" lors de la connexion

La première étape de tout dépannage doit être `docker compose logs [nom-du-service]` pour inspecter les erreurs.

## **Plan de Réponse aux Incidents**

1. En cas de compromission suspectée d'un token

    :

   * Désactivez immédiatement la connexion dans la base de données : `UPDATE client_connections SET is_active = false WHERE id = '[ID_CONNEXION]';`.
   * Notifiez l'utilisateur.
   * Forcez la révocation du token auprès du fournisseur de service (Google, etc.).

2. En cas de détection d'un accès non autorisé

    :

   * Bloquez l'adresse IP source au niveau du pare-feu.
   * Analysez les journaux d'accès de l'API et de Nginx pour identifier l'étendue de l'intrusion.
   * Effectuez une rotation de tous les secrets concernés (`N8N_INTERNAL_TOKEN`, etc.).

3. En cas de fuite de données avérée

    :

   * Isolez le système affecté.
   * Identifiez précisément les données qui ont fuité.
   * Notifiez les utilisateurs concernés conformément aux réglementations (RGPD).
   * Mettez à jour tous les credentials et secrets.

## **Monitoring des performances**

### **Pour le serveur IA**

```bash
# Monitoring GPU en temps réel
watch -n 1 nvidia-smi

# Utilisation mémoire des modèles
docker exec ollama ollama ps

# Logs Caddy pour les accès API
sudo tail -f /var/log/caddy/ia.otobot.fr.log
```

### **Pour les serveurs applicatifs**

```bash
# Utilisation ressources par conteneur
docker stats

# Monitoring base de données
docker exec otobot_postgres_db psql -U otobot_admin -c "SELECT * FROM pg_stat_activity;"

# Monitoring des connexions actives
docker exec otobot_postgres_db psql -U frontend_user -d otobot_frontend -c "SELECT * FROM v_user_dashboard;"
```

------

# Annexes

## Annexe A : Référence Complète de l'API Interne

### **Authentification**

Toutes les requêtes doivent contenir l'en-tête `x-internal-token: [VOTRE_TOKEN_INTERNE]`.

### **Endpoints pour N8N**

* ```
  GET /api/internal/user/:userId/credentials/:serviceName
  ```

  * **Description**: Récupère les credentials actifs pour un utilisateur et un service donnés.
  * **Réponse 200**: `{ "connectionId": "...", "credentials": { "accessToken": "...", "apiKey": "..." }, "metadata": { ... } }`
  * **Réponse 404**: `{ "error": "Connection not found", ... }`

* ```
  GET /api/internal/user/:userId/connections
  ```

  * **Description**: Liste toutes les connexions d'un utilisateur.
  * **Réponse 200**: `{ "userId": "...", "connections": [ { "id": "...", "service_name": "google", ... } ] }`

* ```
  GET /api/internal/connection-status/:connectionId
  ```

  * **Description**: Vérifie le statut détaillé d'une connexion spécifique.
  * **Réponse 200**: `{ "id": "...", "status": "valid|refresh_needed|expired", ... }`

* ```
  POST /api/internal/refresh-tokens
  ```

  * **Description**: Déclenche le refresh des tokens expirés.
  * **Réponse 200**: `{ "processed": 5, "results": [...] }`

* ```
  GET /health
  ```

  * **Description**: Endpoint de santé pour la supervision.
  * **Réponse 200**: `{ "status": "ok", ... }`

### **Endpoints OAuth**

* ```
  GET /api/oauth/connect/:service?userId=...&returnUrl=...
  ```

  * **Description**: Initie le flux OAuth pour un service.
  * **Réponse**: Redirection vers le provider OAuth

* ```
  GET /api/oauth/callback/:service?code=...&state=...
  ```

  * **Description**: Callback OAuth après autorisation.
  * **Réponse**: Redirection vers ToolJet avec succès/erreur

* ```
  GET /api/oauth/apps
  ```

  * **Description**: Liste les applications OAuth disponibles.
  * **Réponse 200**: `{ "apps": [...] }`

### **Endpoints ToolJet**

* ```
  POST /api/tooljet/auth/login
  ```

  * **Description**: Authentification utilisateur.
  * **Body**: `{ "email": "...", "password": "..." }`
  * **Réponse 200**: `{ "token": "...", "client": {...} }`

* ```
  GET /api/tooljet/dashboard
  ```

  * **Description**: Données du dashboard principal.
  * **Headers**: `Authorization: Bearer [TOKEN]`

* ```
  GET /api/tooljet/connections
  ```

  * **Description**: Liste des connexions du client.

* ```
  GET /api/tooljet/curation-sources
  ```

  * **Description**: Liste des sources de curation.

* ```
  POST /api/tooljet/curation-sources
  ```

  * **Description**: Ajoute une source de curation.
  * **Body**: `{ "source_type": "WEBSITE|RSS_FEED|SOCIAL_ACCOUNT|BLOG", "source_value": "...", "source_name": "..." }`

## Annexe B : Schéma de la Base de Données

### **Tables importantes (base** **`otobot_frontend`\**\**)**

* users

  : Contient les informations sur les utilisateurs.

  * `id` (UUID), `client_id` (UUID), `email`, `first_name`, `last_name`, `role` (admin|user), `is_active`.

* clients

  : Contient les informations sur les entreprises clientes.

  * `id` (UUID), `company_name`, `email`, `password_hash`, `is_active`.

* services

  : Définit les services disponibles (Google, Notion...).

  * `id`, `name`, `display_name`, `oauth_type`, `oauth_authorization_url`, `oauth_token_url`.

* client_connections

  : Table centrale qui lie un utilisateur à un service et stocke les credentials.

  * `id` (UUID), `client_id`, `user_id`, `service_id`, `encrypted_access_token`, `encrypted_refresh_token`, `token_expires_at`, `oauth_app_id`, `is_active`.

* oauth_applications

  : Applications OAuth configurées.

  * `id` (UUID), `client_id`, `service_id`, `app_name`, `encrypted_client_id`, `encrypted_client_secret`, `redirect_uri`, `is_global`.

* curation_sources

  : Sources de veille configurées.

  * `id` (UUID), `user_id`, `source_type`, `source_value`, `source_name`, `metadata`, `is_active`.

* credential_access_logs

  : Journal d'audit pour chaque accès à un credential.

  * `id`, `client_connection_id`, `accessed_by`, `access_type`, `created_at`.

* client_sessions

  : Sessions utilisateurs pour ToolJet.

  * `id`, `client_id`, `user_id`, `session_token`, `expires_at`.

* user_permissions

  : Permissions granulaires par utilisateur.

  * `id`, `user_id`, `permission_code`, `granted_at`.