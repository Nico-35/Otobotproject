// OtobotCredentialFetcher.node.js

const axios = require('axios');

class OtobotCredentialFetcher {
    description = {
        displayName: 'Otobot Credential Fetcher',
        name: 'otobotCredentialFetcher',
        icon: 'fa:key',
        group: ['transform'],
        version: 1,
        description: 'Récupère les credentials stockés dans la base Otobot',
        defaults: {
            name: 'Otobot Credentials',
            color: '#1A82e2',
        },
        inputs: ['main'],
        outputs: ['main'],
        credentials: [
            {
                name: 'otobotDatabaseApi',
                required: true,
            },
        ],
        properties: [
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                options: [
                    {
                        name: 'Get User Credentials',
                        value: 'getUserCredentials',
                        description: 'Récupère les credentials pour un utilisateur et un service',
                    },
                    {
                        name: 'List User Connections',
                        value: 'listUserConnections',
                        description: 'Liste toutes les connexions actives d\'un utilisateur',
                    },
                    {
                        name: 'Check Connection Status',
                        value: 'checkStatus',
                        description: 'Vérifie le statut d\'une connexion',
                    },
                ],
                default: 'getUserCredentials',
                noDataExpression: true,
            },
            {
                displayName: 'User ID',
                name: 'userId',
                type: 'string',
                default: '',
                required: true,
                description: 'ID UUID de l\'utilisateur',
                displayOptions: {
                    show: {
                        operation: ['getUserCredentials', 'listUserConnections'],
                    },
                },
            },
            {
                displayName: 'Service',
                name: 'service',
                type: 'options',
                options: [
                    {
                        name: 'Notion',
                        value: 'notion',
                    },
                    {
                        name: 'Google Workspace',
                        value: 'google',
                    },
                    {
                        name: 'Microsoft 365',
                        value: 'microsoft',
                    },
                    {
                        name: 'Slack',
                        value: 'slack',
                    },
                ],
                default: 'notion',
                required: true,
                displayOptions: {
                    show: {
                        operation: ['getUserCredentials'],
                    },
                },
                description: 'Le service pour lequel récupérer les credentials',
            },
            {
                displayName: 'Connection ID',
                name: 'connectionId',
                type: 'string',
                default: '',
                displayOptions: {
                    show: {
                        operation: ['checkStatus'],
                    },
                },
                description: 'ID de la connexion à vérifier',
            },
        ],
    };

    async execute() {
        const items = this.getInputData();
        const returnData = [];
        const operation = this.getNodeParameter('operation', 0);
        
        // Récupération des credentials
        const credentials = await this.getCredentials('otobotDatabaseApi');
        
        if (!credentials) {
            throw new Error('Aucune credential Otobot configurée');
        }

        const { clientId, internalApiUrl, internalToken } = credentials;

        // Configuration axios
        const axiosConfig = {
            headers: {
                'x-internal-token': internalToken,
                'Content-Type': 'application/json',
            },
        };

        for (let i = 0; i < items.length; i++) {
            try {
                let responseData;

                switch (operation) {
                    case 'getUserCredentials':
                        const userId = this.getNodeParameter('userId', i);
                        const service = this.getNodeParameter('service', i);
                        
                        const credUrl = `${internalApiUrl}/api/internal/user/${userId}/credentials/${service}`;
                        
                        console.log(`Appel API: ${credUrl}`);
                        
                        const credResponse = await axios.get(credUrl, axiosConfig);
                        responseData = credResponse.data;
                        
                        returnData.push({
                            json: {
                                ...items[i].json,
                                connectionId: responseData.connectionId,
                                credentials: responseData.credentials,
                                metadata: responseData.metadata,
                                userId: userId,
                                service: service,
                            },
                        });
                        break;

                    case 'listUserConnections':
                        const listUserId = this.getNodeParameter('userId', i);
                        const listUrl = `${internalApiUrl}/api/internal/user/${listUserId}/connections`;
                        
                        const listResponse = await axios.get(listUrl, axiosConfig);
                        responseData = listResponse.data;
                        
                        returnData.push({
                            json: {
                                ...items[i].json,
                                userId: listUserId,
                                connections: responseData.connections,
                            },
                        });
                        break;

                    case 'checkStatus':
                        const connectionId = this.getNodeParameter('connectionId', i);
                        const statusUrl = `${internalApiUrl}/api/internal/connection-status/${connectionId}`;
                        
                        const statusResponse = await axios.get(statusUrl, axiosConfig);
                        responseData = statusResponse.data;
                        
                        returnData.push({
                            json: {
                                ...items[i].json,
                                connectionStatus: responseData,
                            },
                        });
                        break;

                    default:
                        throw new Error(`Operation non supportée: ${operation}`);
                }

            } catch (error) {
                if (error.response && error.response.status === 404) {
                    returnData.push({
                        json: {
                            ...items[i].json,
                            error: 'Connection not found',
                            hasCredentials: false,
                            userId: this.getNodeParameter('userId', i),
                            service: operation === 'getUserCredentials' ? this.getNodeParameter('service', i) : undefined,
                        },
                    });
                } else {
                    throw new Error(`Erreur lors de la récupération des credentials: ${error.message}`);
                }
            }
        }

        return [returnData];
    }
}

module.exports = {
    OtobotCredentialFetcher
};