// OtobotDatabaseApi.credentials.js

class OtobotDatabaseApi {
    name = 'otobotDatabaseApi';
    displayName = 'Otobot Database Connection';
    documentationUrl = '';
    properties = [
        {
            displayName: 'Client ID',
            name: 'clientId',
            type: 'string',
            default: '',
            required: true,
            description: 'ID unique du client dans la base Otobot',
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

module.exports = {
    OtobotDatabaseApi
};