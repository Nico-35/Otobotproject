# Système de Gestion Sécurisée des Credentials Clients

## 🎯 Vue d'ensemble

Ce système permet de stocker et gérer de manière sécurisée les credentials OAuth2 et clés API de nos clients pour leur permettre d'automatiser leurs processus via N8N.

### Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│ API Interne │────▶│  PostgreSQL │
│   (Futur)   │     │   Port 3001 │     │  (Chiffré)  │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                    ┌──────▼──────┐
                    │     N8N     │
                    │ (Workflows) │
                    └─────────────┘
```

## 🚀 Installation

### Prérequis

- Docker et Docker Compose installés
- Un VPS avec Ubuntu 22.04+
- Accès SSH au serveur
- PostgreSQL avec l'extension pgcrypto

### Étapes d'installation

1. **Cloner le repository**
   ```bash
   git clone git@github.com:votre-org/Otobotproject.git
   cd Otobotproject
   ```

2. **Générer les clés de chiffrement**
   ```bash
   # Générer la clé maître
   openssl rand -hex 32
   # Sauvegarder cette clé dans votre .env
   ```

3. **Configurer l'environnement**
   ```bash
   cp .env.example .env
   # Éditer .env avec vos valeurs
   ```

4. **Créer la base de données**
   ```bash
   # Se connecter à PostgreSQL
   docker exec -it postgres psql -U postgres
   
   # Exécuter le script de création
   \i /path/to/create-frontend-database.sql
   ```

5. **Lancer les services**
   ```bash
   docker-compose --profile api up -d
   ```

## 🔐 Sécurité

### Chiffrement

- **Algorithme** : AES-256-GCM
- **Clé** : 256 bits (32 bytes)
- **Stockage** : Les tokens sont chiffrés avant stockage en base
- **Rotation** : Support de versions de clés pour rotation future

### Authentification

- L'API interne utilise un token Bearer partagé avec N8N
- Toutes les requêtes sont loggées pour audit
- Rate limiting activé sur tous les endpoints

### Bonnes pratiques

1. **Ne jamais committer les fichiers .env**
2. **Rotation mensuelle des tokens internes**
3. **Backup régulier de la base de données**
4. **Monitoring des tokens expirés**

## 📊 Monitoring

### Scripts disponibles

```bash
# Monitoring des tokens
node monitor-tokens.js

# Mode watch (refresh toutes les 5 min)
node monitor-tokens.js --watch

# Tests du système
node test-connections.js

# Insertion de données de test
node test-connections.js --insert-test-data
```

### Métriques importantes

- Nombre de tokens expirés
- Tokens expirant dans les 24h
- Erreurs de refresh
- Connexions inutilisées

## 🔧 Utilisation dans N8N

### Configuration de la credential personnalisée

1. Ajouter le type de credential `OtobotDatabaseCredential`
2. Configurer avec :
   - Client ID
   - Service (google, microsoft, etc.)
   - URL de l'API interne
   - Token interne

### Utilisation dans un workflow

```javascript
// Node personnalisé Otobot Credential Fetcher
{
  "operation": "getCredentials",
  "credentials": {
    "otobotDatabaseApi": {
      "clientId": "{{clientId}}",
      "service": "google"
    }
  }
}
```

## 🐛 Dépannage

### Erreurs communes

1. **Token expiré sans refresh token**
   - Le client doit se reconnecter manuellement
   - Vérifier dans le monitoring : `node monitor-tokens.js`

2. **Erreur de chiffrement**
   - Vérifier que `ENCRYPTION_MASTER_KEY` est définie
   - Vérifier la longueur de la clé (64 caractères hex)

3. **Connexion refusée à l'API**
   - Vérifier que le token interne est correct
   - Vérifier les logs : `docker-compose logs api-internal`

### Logs

```bash
# Logs de l'API interne
docker-compose logs -f api-internal

# Logs du token refresher
docker-compose logs -f token-refresher

# Logs PostgreSQL
docker-compose logs -f postgres
```

## 📋 Procédures

### Ajouter un nouveau service

1. Insérer dans la table `services` :
   ```sql
   INSERT INTO services (name, display_name, oauth_type, oauth_authorization_url, oauth_token_url, oauth_scopes)
   VALUES ('nouveau_service', 'Nouveau Service', 'oauth2', 'https://...', 'https://...', 'scope1 scope2');
   ```

2. Ajouter le service dans `OtobotDatabaseCredential.ts`

3. Implémenter la logique de refresh si OAuth2

### Rotation de la clé de chiffrement

1. Générer une nouvelle clé
2. Ajouter dans `encryption_keys`
3. Re-chiffrer progressivement les données
4. Mettre à jour `ENCRYPTION_MASTER_KEY`

## 🚨 Alertes et notifications

Le système génère des alertes pour :

- Tokens expirés depuis plus de 7 jours
- Échecs répétés de refresh (>5 tentatives)
- Connexions jamais utilisées après 30 jours
- Erreurs d'API critiques

## 📞 Support

Pour toute question ou problème :

1. Consulter les logs
2. Exécuter les scripts de diagnostic
3. Vérifier la documentation
4. Contacter l'équipe technique

---

**Dernière mise à jour** : Juin 2025  
**Version** : 1.0.0  
**Mainteneur** : Équipe Otobot