// OtobotDatabaseCredential.ts
// Fichier à placer dans le dossier custom de N8N

import {
    ICredentialType,
    INodeProperties,
} from 'n8n-workflow';

export class OtobotDatabaseCredential implements ICredentialType {
    name = 'otobotDatabaseApi';
    displayName = 'Otobot Database Connection';
    documentationUrl = 'https://docs.otobot.fr/credentials';
    
    properties: INodeProperties[] = [
        {
            displayName: 'Client ID',
            name: 'clientId',
            type: 'string',
            default: '',
            required: true,
            description: 'L\'ID unique du client dans la base Otobot',
        },
        {
            displayName: 'Service',
            name: 'service',
            type: 'options',
            options: [
                {
                    name: 'Google Workspace',
                    value: 'google',
                },
                {
                    name: 'Microsoft 365',
                    value: 'microsoft',
                },
                {
                    name: 'Facebook Business',
                    value: 'facebook',
                },
                {
                    name: 'LinkedIn',
                    value: 'linkedin',
                },
                {
                    name: 'Slack',
                    value: 'slack',
                },
                {
                    name: 'OpenAI',
                    value: 'openai',
                },
                {
                    name: 'Anthropic Claude',
                    value: 'anthropic',
                },
                {
                    name: 'Notion',
                    value: 'notion',
                },
            ],
            default: 'google',
            required: true,
            description: 'Le service pour lequel récupérer les credentials',
        },
        {
            displayName: 'API Interne URL',
            name: 'internalApiUrl',
            type: 'string',
            default: 'http://api-internal:3001',
            required: true,
            description: 'URL de l\'API interne Otobot',
        },
        {
            displayName: 'Token Interne',
            name: 'internalToken',
            type: 'string',
            default: '',
            required: true,
            typeOptions: {
                password: true,
            },
            description: 'Token d\'authentification pour l\'API interne',
        },
    ];
}