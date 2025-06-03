#!/bin/sh
# docker-entrypoint-cron.sh - Script d'entrée pour le conteneur de refresh

# Exporter les variables d'environnement pour cron
printenv | grep -E '^(INTERNAL_API_URL|N8N_INTERNAL_TOKEN)' > /etc/environment

# Démarrer cron en foreground
echo "Démarrage du service cron pour le refresh des tokens..."
echo "Les tokens seront vérifiés toutes les 30 minutes"

# Lancer une première vérification au démarrage
node /app/token-refresher.js

# Démarrer cron et suivre les logs
crond -f -l 2 -L /var/log/cron.log &
CRON_PID=$!

# Suivre les logs en temps réel
tail -f /var/log/cron.log &

# Attendre que cron se termine (ne devrait jamais arriver)
wait $CRON_PID