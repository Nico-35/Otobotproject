# 🔐 Comprendre l'API et le Chiffrement - Guide Détaillé

## Table des matières

1. [🎯 1. Introduction - Pourquoi c'est important {#introduction}](#🎯%201.%20Introduction%20-%20Pourquoi%20c'est%20important%20{%20introduction})
2. [🔒 2. Le chiffrement expliqué simplement {#chiffrement}](#🔒%202.%20Le%20chiffrement%20expliqué%20simplement%20{%20chiffrement})
3. [🔧 3. Comment fonctionne notre système de chiffrement {#systeme-chiffrement}](#🔧%203.%20Comment%20fonctionne%20notre%20système%20de%20chiffrement%20{%20systeme-chiffrement})
4. [🌐 4. L'API : Le gardien de vos données {#api}](#🌐%204.%20L'API%20Le%20gardien%20de%20vos%20données%20{%20api})
5. [🚀 5. Le parcours complet d'une donnée {#parcours-donnee}](#🚀%205.%20Le%20parcours%20complet%20d'une%20donnée%20{%20parcours-donnee})
6. [🛡️ 6. Sécurité et bonnes pratiques {#securite}](#🛡️%206.%20Sécurité%20et%20bonnes%20pratiques%20{%20securite})
7. [💡 7. Exemples concrets {#exemples}](#💡%207.%20Exemples%20concrets%20{%20exemples})
8. [❓ 8. Questions fréquentes {#faq}](#❓%208.%20Questions%20fréquentes%20{%20faq})

---

## 🎯 1. Introduction - Pourquoi c'est important {#introduction}

### Le problème fondamental

Imaginez que vous devez stocker les clés de votre maison quelque part pour qu'un ami puisse les récupérer. Vous avez plusieurs options :

1. **Sans protection** ❌ : Les laisser sous le paillasson
   - N'importe qui peut les prendre
   - C'est ce qui se passe si on stocke les tokens en clair

2. **Avec protection simple** ⚠️ : Les mettre dans une boîte fermée à clé
   - Mieux, mais si quelqu'un trouve la clé de la boîte...
   - C'est comme un mot de passe simple

3. **Avec protection forte** ✅ : Un coffre-fort avec code + un gardien
   - Le coffre = chiffrement
   - Le gardien = l'API
   - C'est notre solution !

### Ce que nous protégeons

Les "tokens" sont comme des badges d'accès temporaires :
- Google vous donne un badge pour accéder à Gmail
- Facebook vous donne un badge pour publier
- Ces badges sont précieux et doivent être protégés

---

## 🔒 2. Le chiffrement expliqué simplement {#chiffrement}

### Qu'est-ce que le chiffrement ?

Le chiffrement transforme des données lisibles en données illisibles sans la bonne clé.

#### Analogie : Le coffre-fort et le cadenas

```
SANS CHIFFREMENT :
Token Google : "ya29.a0AfH6SMBx7..." → Stocké tel quel
Problème : Si quelqu'un accède à la base, il peut tout lire !

AVEC CHIFFREMENT :
Token Google : "ya29.a0AfH6SMBx7..." → "x9$mK#2@pL9..." 
Avantage : Illisible sans la clé de déchiffrement !
```

### Les composants du chiffrement

Notre système utilise **AES-256-GCM**. Décomposons :

1. **AES** (Advanced Encryption Standard)
   - Standard utilisé par les gouvernements et banques
   - Comme un coffre-fort incassable

2. **256** 
   - Taille de la clé en bits
   - Plus c'est grand, plus c'est sécurisé
   - 256 bits = 2^256 possibilités (nombre astronomique !)

3. **GCM** (Galois/Counter Mode)
   - Vérifie que personne n'a modifié les données
   - Comme un sceau de cire sur une lettre

### Comment ça marche concrètement ?

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Donnée Claire  │────▶│   Chiffrement   │────▶│ Donnée Chiffrée │
│ "Token123..."   │     │   + Clé + IV    │     │  "x9$mK#2@..."  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Clé de chiffrement  │
                    │ (32 bytes/256 bits) │
                    └─────────────────────┘
```

#### Les éléments clés :

1. **La clé de chiffrement** (ENCRYPTION_MASTER_KEY)
   - 32 bytes = 64 caractères hexadécimaux
   - Exemple : `a7f3b2c8d9e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0`
   - **CRITIQUE** : Sans elle, impossible de déchiffrer !

2. **Le vecteur d'initialisation (IV)**
   - Nombre aléatoire unique pour chaque chiffrement
   - Empêche les attaques par répétition
   - Stocké avec les données chiffrées

3. **Le tag d'authentification**
   - Signature qui garantit l'intégrité
   - Si quelqu'un modifie les données, le tag ne correspondra plus

---

## 🔧 3. Comment fonctionne notre système de chiffrement 

### Le processus de chiffrement pas à pas

Prenons l'exemple d'un token Google : `ya29.a0AfH6SMBx7...`

#### Étape 1 : Préparation

```javascript
// Notre token à protéger
const tokenClair = "ya29.a0AfH6SMBx7...";

// Notre clé secrète (depuis .env)
const cleSecrete = "a7f3b2c8d9e4f5a6b7c8d9e0f1a2b3c4...";
```

#### Étape 2 : Génération du vecteur d'initialisation

```javascript
// Génère 16 bytes aléatoires
const iv = crypto.randomBytes(16);
// Résultat : Buffer de 16 bytes uniques
```

**Pourquoi ?** Si on chiffre deux fois le même token, on obtiendra deux résultats différents grâce à l'IV différent. C'est une protection supplémentaire.

#### Étape 3 : Chiffrement

```javascript
// Création du "chiffreur"
const cipher = crypto.createCipheriv('aes-256-gcm', cleSecrete, iv);

// Chiffrement du token
let tokenChiffre = cipher.update(tokenClair, 'utf8', 'hex');
tokenChiffre += cipher.final('hex');

// Récupération du tag d'authentification
const authTag = cipher.getAuthTag();
```

#### Étape 4 : Stockage

Ce qui est stocké en base de données :
```
1:f3a2b5c8:9d8e7f6a:x9$mK#2@pL9b7n5...
│  │         │         │
│  │         │         └── Token chiffré
│  │         └── Tag d'authentification
│  └── Vecteur d'initialisation (IV)
└── Version de la clé
```

### Le processus de déchiffrement

C'est l'inverse :

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

### Exemple visuel complet

```
CHIFFREMENT :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Token original : "ya29.a0AfH6SMBx7..."
                        ↓
                 [Algorithme AES-256]
                 [Clé : a7f3b2c8...]
                 [IV : 16 bytes aléatoires]
                        ↓
Résultat : {
  encrypted: "8f7d6e5c4b3a2918...",
  iv: "1a2b3c4d5e6f7890",
  authTag: "9f8e7d6c5b4a3b2a",
  version: 1
}
                        ↓
Format stocké : "1:1a2b3c4d5e6f7890:9f8e7d6c5b4a3b2a:8f7d6e5c4b3a2918..."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DÉCHIFFREMENT :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Format stocké : "1:1a2b3c4d5e6f7890:9f8e7d6c5b4a3b2a:8f7d6e5c4b3a2918..."
                        ↓
                 [Parse les éléments]
                        ↓
                 [Algorithme AES-256]
                 [Clé : a7f3b2c8...]
                 [IV : 1a2b3c4d5e6f7890]
                 [Tag : 9f8e7d6c5b4a3b2a]
                        ↓
Token déchiffré : "ya29.a0AfH6SMBx7..."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🌐 4. L'API : Le gardien de vos données {#api}

### Qu'est-ce qu'une API ?

**API** = Application Programming Interface (Interface de Programmation d'Application)

**Analogie simple** : L'API est comme un serveur dans un restaurant
- Vous (N8N) = le client
- L'API = le serveur
- La cuisine (base de données) = où sont préparées les données
- Le menu = les endpoints disponibles

### Architecture de notre API

```
┌─────────────────────────────────────────────────────┐
│                   API INTERNE                        │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. AUTHENTIFICATION (Middleware)                    │
│     └─> Vérifie le token x-internal-token           │
│                                                      │
│  2. VALIDATION (Middleware)                          │
│     └─> Vérifie les paramètres (UUID, service...)   │
│                                                      │
│  3. RATE LIMITING (Middleware)                       │
│     └─> Limite le nombre de requêtes                │
│                                                      │
│  4. ROUTES (Endpoints)                               │
│     ├─> GET /health                                  │
│     ├─> GET /api/internal/credentials/:id/:service  │
│     ├─> GET /api/internal/connections/:id           │
│     └─> POST /api/internal/refresh-tokens           │
│                                                      │
│  5. GESTIONNAIRE DE CREDENTIALS                      │
│     └─> Chiffrement/Déchiffrement                   │
│                                                      │
│  6. LOGGING                                          │
│     └─> Enregistre toutes les actions               │
└─────────────────────────────────────────────────────┘
```

### Les couches de sécurité

#### Couche 1 : Authentification

```javascript
// Chaque requête doit avoir le bon token
headers: {
  'x-internal-token': 'votre-token-secret-très-long'
}

// L'API vérifie :
if (token !== process.env.N8N_INTERNAL_TOKEN) {
  return "Accès refusé !";
}
```

**Analogie** : C'est comme montrer votre badge à l'entrée d'un bâtiment sécurisé.

#### Couche 2 : Validation

L'API vérifie que les données reçues sont correctes :

```javascript
// Exemple de requête
GET /api/internal/credentials/550e8400-e29b-41d4-a716/google

// L'API vérifie :
- Est-ce que "550e8400-e29b-41d4-a716" est un UUID valide ?
- Est-ce que "google" est un service qu'on connaît ?
- Si non → Erreur 400 (Bad Request)
```

#### Couche 3 : Rate Limiting

Limite le nombre de requêtes pour éviter les abus :

```
Rate Limiter Global : 100 requêtes / 15 minutes
Rate Limiter Strict : 10 requêtes / 5 minutes (pour endpoints sensibles)

Si dépassement → Erreur 429 (Too Many Requests)
```

**Analogie** : Comme un tourniquet qui limite le nombre de personnes entrant dans un métro.

### Comment l'API traite une requête

Prenons l'exemple de N8N qui demande un token Google :

```
REQUÊTE N8N :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GET http://api-internal:3001/api/internal/credentials/client123/google
Headers: {
  'x-internal-token': 'mon-token-secret'
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TRAITEMENT API :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. AUTHENTIFICATION
   ├─> Token présent ? ✓
   └─> Token valide ? ✓

2. VALIDATION
   ├─> client123 est un UUID valide ? ✓
   └─> google est un service connu ? ✓

3. RATE LIMITING
   └─> Nombre de requêtes OK ? ✓

4. RÉCUPÉRATION EN BASE
   SELECT * FROM client_connections 
   WHERE client_id = 'client123' 
   AND service_id = 1 (google)

5. DÉCHIFFREMENT
   ├─> Parse : "1:iv:tag:encrypted"
   ├─> Déchiffre avec la clé maître
   └─> Obtient : "ya29.a0AfH6SMBx7..."

6. LOGGING
   INSERT INTO credential_access_logs
   (qui, quand, quoi, depuis où)

7. RÉPONSE
   {
     "connectionId": "abc123",
     "credentials": {
       "accessToken": "ya29.a0AfH6SMBx7..."
     },
     "metadata": {
       "tokenExpiresAt": "2025-06-03T10:00:00Z"
     }
   }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🚀 5. Le parcours complet d'une donnée {#parcours-donnee}

### Scénario : Un client connecte son compte Google

Suivons le parcours d'un token depuis sa création jusqu'à son utilisation :

#### Phase 1 : Obtention du token (futur frontend)

```
1. Client clique "Connecter Google"
                ↓
2. Redirection vers Google OAuth
                ↓
3. Client autorise l'accès
                ↓
4. Google renvoie un token
   {
     "access_token": "ya29.a0AfH6SMBx7...",
     "refresh_token": "1//0gLkPp...",
     "expires_in": 3600
   }
```

#### Phase 2 : Stockage sécurisé

```
5. Frontend envoie à l'API
                ↓
6. API reçoit les tokens
                ↓
7. CHIFFREMENT :
   - access_token → chiffré
   - refresh_token → chiffré
                ↓
8. STOCKAGE en base :
   INSERT INTO client_connections
   (encrypted_access_token, encrypted_refresh_token, ...)
                ↓
9. LOGGING :
   "Client X a connecté Google à 14h32"
```

#### Phase 3 : Utilisation dans N8N

```
10. Workflow N8N démarre
                ↓
11. Node "Otobot Credential Fetcher"
    demande le token Google
                ↓
12. Requête API :
    GET /credentials/clientX/google
    + Token d'authentification
                ↓
13. API vérifie, déchiffre, renvoie
                ↓
14. N8N utilise le token pour
    accéder à l'API Google
                ↓
15. Action effectuée !
    (mail envoyé, fichier créé...)
```

### Diagramme de flux complet

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   CLIENT    │      │   GOOGLE    │      │  FRONTEND   │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                     │                     │
       │  1. Connexion       │                     │
       ├────────────────────────────────────────▶ │
       │                     │                     │
       │  2. Redirection     │                     │
       ├────────────────────▶│                     │
       │                     │                     │
       │  3. Autorisation    │                     │
       │◀────────────────────┤                     │
       │                     │                     │
       │  4. Token           │                     │
       │                     ├────────────────────▶│
       │                     │                     │
       ▼                     ▼                     ▼
                                                   │
                                                   │ 5. Envoi tokens
                                                   ▼
┌─────────────────────────────────────────────────────────────┐
│                         API INTERNE                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  6. Réception → 7. Chiffrement → 8. Stockage BDD    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                                │
                                │ 9. Token chiffré stocké
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                          BASE DE DONNÉES                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Table: client_connections                           │    │
│  │  - encrypted_access_token: "1:iv:tag:données..."    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                                │
                                │ 10. Plus tard...
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                             N8N                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  11. Workflow → 12. Demande token → 13. Utilisation │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛡️ 6. Sécurité et bonnes pratiques {#securite}

### Les niveaux de sécurité

#### Niveau 1 : Protection physique
- **Serveur** : VPS hébergé en France (OVH)
- **Accès** : SSH avec clé uniquement
- **Firewall** : Ports fermés sauf nécessaires

#### Niveau 2 : Protection réseau
- **Docker** : Réseau isolé entre conteneurs
- **API** : Accessible uniquement en interne
- **HTTPS** : Chiffrement des communications (à venir)

#### Niveau 3 : Protection applicative
- **Authentification** : Token requis
- **Validation** : Paramètres vérifiés
- **Rate limiting** : Anti-abus

#### Niveau 4 : Protection des données
- **Chiffrement** : AES-256-GCM
- **Clés** : Stockées séparément
- **Audit** : Tout est tracé

### Les bonnes pratiques essentielles

#### 1. Gestion des clés

```
❌ MAUVAIS :
- Clé dans le code
- Clé simple (123456...)
- Clé partagée par email

✅ BON :
- Clé dans variables d'environnement
- Clé générée aléatoirement (64 caractères)
- Clé dans gestionnaire de mots de passe
```

#### 2. Principe du moindre privilège

```
Chaque composant n'a accès qu'à ce dont il a besoin :
- N8N : peut lire les tokens, pas les modifier
- API : peut tout faire mais vérifie les droits
- Frontend : peut créer/modifier ses propres connexions
```

#### 3. Défense en profondeur

```
Si une couche est compromise, les autres protègent :

Attaquant → Firewall → API Auth → Validation → Chiffrement → Audit
              ↓         ↓           ↓            ↓            ↓
            Bloqué    Bloqué      Bloqué    Données illisibles  Tracé
```

### Scénarios d'attaque et protections

#### Scénario 1 : Vol de la base de données

```
Attaquant obtient une copie de la base
                ↓
Il voit : "1:1a2b3c:9f8e7d:8f7d6e5c4b3a..."
                ↓
Sans la clé de chiffrement → Données inutilisables !
```

#### Scénario 2 : Interception réseau

```
Attaquant écoute le réseau
                ↓
Communications Docker isolées + Future HTTPS
                ↓
Ne peut pas intercepter
```

#### Scénario 3 : Tentative de force brute

```
Attaquant essaie plein de requêtes
                ↓
Rate limiting → Bloqué après 10 essais
                ↓
Logs d'alerte générés
```

---

## 💡 7. Exemples concrets {#exemples}

### Exemple 1 : Stockage d'un token Google

```javascript
// Ce que reçoit l'API
const donnees = {
  clientId: "550e8400-e29b-41d4-a716",
  serviceId: 1, // Google
  accessToken: "ya29.a0AfH6SMBx7QWERTY123456",
  refreshToken: "1//0gLkPpXYZ789ABCDEF",
  expiresIn: 3600
};

// Processus de chiffrement
const chiffreur = new CredentialEncryption();

// 1. Chiffrer l'access token
const accessChiffre = chiffreur.encrypt(donnees.accessToken);
console.log(accessChiffre);
// Résultat : {
//   encrypted: "8f7d6e5c4b3a2918f7e6d5c4b3a29187",
//   iv: "1a2b3c4d5e6f7890abcdef1234567890",
//   authTag: "9f8e7d6c5b4a3b2a1f0e9d8c7b6a5948",
//   version: 1
// }

// 2. Formater pour stockage
const pourStockage = chiffreur.formatForStorage(accessChiffre);
console.log(pourStockage);
// "1:1a2b3c4d5e6f7890abcdef1234567890:9f8e7d6c5b4a3b2a1f0e9d8c7b6a5948:8f7d6e5c4b3a2918f7e6d5c4b3a29187"

// 3. Stocker en base
INSERT INTO client_connections (encrypted_access_token) VALUES (pourStockage);
```

### Exemple 2 : Récupération pour N8N

```javascript
// N8N demande un token
GET /api/internal/credentials/550e8400-e29b-41d4-a716/google

// Dans l'API :
async function getCredentials(clientId, serviceName) {
  // 1. Récupérer de la base
  const result = await db.query(
    "SELECT encrypted_access_token FROM client_connections WHERE ..."
  );
  
  // 2. Parser les données stockées
  const stored = "1:1a2b3c4d5e6f7890abcdef1234567890:9f8e7d6c5b4a3b2a1f0e9d8c7b6a5948:8f7d6e5c4b3a2918f7e6d5c4b3a29187";
  const parsed = chiffreur.parseFromStorage(stored);
  
  // 3. Déchiffrer
  const tokenClair = chiffreur.decrypt(parsed);
  // "ya29.a0AfH6SMBx7QWERTY123456"
  
  // 4. Renvoyer à N8N
  return {
    credentials: {
      accessToken: tokenClair
    }
  };
}
```

### Exemple 3 : Gestion d'erreur

```javascript
// Si quelqu'un modifie les données chiffrées
const donneesModifiees = "1:1a2b3c4d5e6f7890abcdef1234567890:MAUVAIS_TAG:8f7d6e5c4b3a2918f7e6d5c4b3a29187";

try {
  const parsed = chiffreur.parseFromStorage(donneesModifiees);
  const resultat = chiffreur.decrypt(parsed);
} catch (error) {
  console.error("Erreur de déchiffrement :", error.message);
  // "Unsupported state or unable to authenticate data"
  // = Les données ont été altérées !
}
```

---

## ❓ 8. Questions fréquentes {#faq}

### Sur le chiffrement

**Q : Pourquoi ne pas utiliser un simple mot de passe ?**
R : Un mot de passe peut être deviné ou forcé. Une clé de 256 bits a 2^256 possibilités, c'est astronomique !

**Q : Que se passe-t-il si je perds la clé de chiffrement ?**
R : Les données sont définitivement perdues. C'est pourquoi il faut des backups sécurisés de la clé.

**Q : Pourquoi stocker l'IV avec les données ?**
R : L'IV n'est pas secret, il doit juste être unique. C'est la clé qui doit rester secrète.

**Q : Le chiffrement ralentit-il le système ?**
R : Non, AES est très rapide. Le chiffrement/déchiffrement prend quelques millisecondes.

### Sur l'API

**Q : Pourquoi une API séparée ?**
R : Pour centraliser la sécurité, les logs, et séparer les responsabilités.

**Q : Pourquoi pas d'accès direct à la base depuis N8N ?**
R : Pour contrôler les accès, logger, et pouvoir changer la base sans toucher N8N.

**Q : Comment l'API sait quel client demande ?**
R : N8N envoie l'ID du client dans la requête, l'API vérifie les droits.

**Q : Que faire si l'API est down ?**
R : Docker la redémarre automatiquement. Monitoring pour alerter.

### Sur la sécurité

**Q : Est-ce vraiment sécurisé ?**
R : Oui, nous utilisons les standards de l'industrie (AES-256, OAuth2, etc.)

**Q : Peut-on faire confiance à Docker ?**
R : Docker isole les conteneurs. C'est une couche de sécurité supplémentaire.

**Q : Et si quelqu'un vole le serveur ?**
R : Sans la clé de chiffrement (qui n'est pas sur le serveur en prod), les données sont illisibles.

**Q : Comment auditer les accès ?**
R : Tout est loggé dans `credential_access_logs`. Qui, quand, quoi, d'où.

### Sur l'utilisation

**Q : Combien de tokens peut-on stocker ?**
R : Pas de limite technique. PostgreSQL peut gérer des millions d'enregistrements.

**Q : Les tokens expirent, que faire ?**
R : Le système les rafraîchit automatiquement avec les refresh tokens.

**Q : Peut-on avoir plusieurs connexions Google par client ?**
R : Oui, chaque connexion a un ID unique et un nom personnalisé.

**Q : Comment révoquer une connexion ?**
R : Via l'API ou directement en base : `is_active = false`.

---

## 🎓 Conclusion

Vous comprenez maintenant :

1. **Le chiffrement** protège vos données comme un coffre-fort incassable
2. **L'API** contrôle l'accès comme un gardien vigilant
3. **Le système complet** offre plusieurs couches de séc