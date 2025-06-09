// OtobotCredentialFetcher.node.js
// Node personnalisé pour récupérer les credentials depuis la base Otobot
// Version mise à jour pour le système multi-utilisateurs

import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeOperationError,
} from 'n8n-workflow';

import axios from 'axios';

export class OtobotCredentialFetcher implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Otobot Credential Fetcher',
        name: 'otobotCredentialFetcher',
        icon: 'fa:key',
        group: ['transform'],
        version: 1,
        description: 'Récupère les credentials stockés dans la base Otobot pour un utilisateur spécifique',
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

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];
        const operation = this.getNodeParameter('operation', 0) as string;
        
        // Récupération des credentials de l'API Otobot
        const credentials = await this.getCredentials('otobotDatabaseApi');
        
        if (!credentials) {
            throw new NodeOperationError(
                this.getNode(),
                'Aucune credential Otobot configurée'
            );
        }

        const { clientId, internalApiUrl, internalToken } = credentials;

        // Configuration axios avec le token interne
        const axiosConfig = {
            headers: {
                'x-internal-token': internalToken as string,
                'Content-Type': 'application/json',
            },
        };

        for (let i = 0; i < items.length; i++) {
            try {
                let responseData;

                switch (operation) {
                    case 'getUserCredentials':
                        // Récupération des credentials pour un utilisateur et service spécifique
                        const userId = this.getNodeParameter('userId', i) as string;
                        const service = this.getNodeParameter('service', i) as string;
                        
                        // URL adaptée pour le système multi-utilisateurs
                        const credUrl = `${internalApiUrl}/api/internal/user/${userId}/credentials/${service}`;
                        
                        console.log(`Appel API: ${credUrl}`);
                        
                        const credResponse = await axios.get(credUrl, axiosConfig);
                        responseData = credResponse.data;
                        
                        // Ajouter les credentials aux données de sortie
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
                        // Liste toutes les connexions d'un utilisateur
                        const listUserId = this.getNodeParameter('userId', i) as string;
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
                        // Vérification du statut d'une connexion
                        const connectionId = this.getNodeParameter('connectionId', i) as string;
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
                        throw new NodeOperationError(
                            this.getNode(),
                            `Operation non supportée: ${operation}`
                        );
                }

            } catch (error) {
                if (error.response?.status === 404) {
                    // Connexion non trouvée
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
                    throw new NodeOperationError(
                        this.getNode(),
                        `Erreur lors de la récupération des credentials: ${error.message}`,
                        { itemIndex: i }
                    );
                }
            }
        }

        return [returnData];
    }
}