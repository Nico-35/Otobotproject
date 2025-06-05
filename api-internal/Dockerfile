# Dockerfile pour l'API Interne
FROM node:18-slim

# Définir le timezone
ENV TZ=Europe/Paris
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Installer les dépendances système nécessaires
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Créer le répertoire de l'application
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm ci --only=production || npm install --production

# Copier le code de l'application
COPY . .

# Exposer le port
EXPOSE 3001

# Commande de démarrage
CMD ["node", "api-internal-n8n.js"]