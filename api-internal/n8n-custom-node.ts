// OtobotCredentialFetcher.node.ts
// Node personnalisé pour récupérer les credentials depuis la base Otobot

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
                        name: 'Get Credentials',
                        value: 'getCredentials',
                        description: 'Récupère les credentials pour un service',
                    },
                    {
                        name: 'List Connections',
                        value: 'listConnections',
                        description: 'Liste toutes les connexions du client',
                    },
                    {
                        name: 'Check Status',
                        value: 'checkStatus',
                        description: 'Vérifie le statut d\'une connexion',
                    },
                ],
                default: 'getCredentials',
                noDataExpression: true,
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
        
        // Récupération des credentials
        const credentials = await this.getCredentials('otobotDatabaseApi');
        
        if (!credentials) {
            throw new NodeOperationError(
                this.getNode(),
                'Aucune credential Otobot configurée'
            );
        }

        const { clientId, service, internalApiUrl, internalToken } = credentials;

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
                    case 'getCredentials':
                        // Récupération des credentials pour le service
                        const credUrl = `${internalApiUrl}/api/internal/credentials/${clientId}/${service}`;
                        const credResponse = await axios.get(credUrl, axiosConfig);
                        responseData = credResponse.data;
                        
                        // Ajouter les credentials aux données de sortie
                        returnData.push({
                            json: {
                                ...items[i].json,
                                credentials: responseData.credentials,
                                metadata: responseData.metadata,
                            },
                        });
                        break;

                    case 'listConnections':
                        // Liste toutes les connexions
                        const listUrl = `${internalApiUrl}/api/internal/connections/${clientId}`;
                        const listResponse = await axios.get(listUrl, axiosConfig);
                        responseData = listResponse.data;
                        
                        returnData.push({
                            json: {
                                ...items[i].json,
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