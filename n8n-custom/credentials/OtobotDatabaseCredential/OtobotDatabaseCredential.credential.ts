// OtobotDatabaseCredential.credential.ts
// Fichier à placer dans ~/Otobotproject/n8n-custom/credentials/OtobotDatabaseCredential/

import {
    ICredentialType,
    INodeProperties,
} from 'n8n-workflow';

export class OtobotDatabaseCredential implements ICredentialType {
    // Nom technique de la credential (utilisé en interne)
    name = 'otobotDatabaseApi';
    
    // Nom affiché dans l'interface N8N
    displayName = 'Otobot Database Connection';
    
    // URL vers la documentation (optionnel)
    documentationUrl = 'https://docs.otobot.fr/credentials';
    
    // Propriétés de la credential
    properties: INodeProperties[] = [
        {
            displayName: 'Client ID',
            name: 'clientId',
            type: 'string',
            default: '',
            required: true,
            description: 'L\'ID unique du client dans la base Otobot (depuis votre .env)',
            placeholder: 'ex: 550e8400-e29b-41d4-a716-446655440000',
        },
        {
            displayName: 'API Interne URL',
            name: 'internalApiUrl',
            type: 'string',
            default: 'http://api-internal:3001',
            required: true,
            description: 'URL de l\'API interne Otobot (utiliser le nom du conteneur Docker)',
            placeholder: 'http://api-internal:3001',
        },
        {
            displayName: 'Token Interne',
            name: 'internalToken',
            type: 'string',
            default: '',
            required: true,
            typeOptions: {
                password: true, // Masque le token dans l'interface
            },
            description: 'Token d\'authentification pour l\'API interne (N8N_INTERNAL_TOKEN depuis .env)',
            placeholder: 'Coller le token depuis votre fichier .env',
        },
        {
            displayName: 'Options avancées',
            name: 'advancedOptions',
            type: 'collection',
            placeholder: 'Ajouter une option',
            default: {},
            options: [
                {
                    displayName: 'Timeout (ms)',
                    name: 'timeout',
                    type: 'number',
                    default: 10000,
                    description: 'Délai d\'attente maximum pour les requêtes API en millisecondes',
                },
                {
                    displayName: 'Retry on Failure',
                    name: 'retryOnFailure',
                    type: 'boolean',
                    default: true,
                    description: 'Réessayer automatiquement en cas d\'échec de connexion',
                },
                {
                    displayName: 'Environment',
                    name: 'environment',
                    type: 'options',
                    options: [
                        {
                            name: 'Production',
                            value: 'production',
                        },
                        {
                            name: 'Development',
                            value: 'development',
                        },
                        {
                            name: 'Test',
                            value: 'test',
                        },
                    ],
                    default: 'production',
                    description: 'Environnement d\'exécution',
                },
            ],
        },
    ];
    
    // Test de connexion (optionnel mais recommandé)
    test: ICredentialTestRequest = {
        request: {
            baseURL: '={{$credentials.internalApiUrl}}',
            url: '/health',
            headers: {
                'x-internal-token': '={{$credentials.internalToken}}',
            },
        },
    };
}

// Interface pour le test de connexion
interface ICredentialTestRequest {
    request: {
        baseURL: string;
        url: string;
        headers: {
            [key: string]: string;
        };
    };
}