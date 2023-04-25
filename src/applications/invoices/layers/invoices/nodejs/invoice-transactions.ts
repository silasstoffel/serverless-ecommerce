import { DocumentClient } from "aws-sdk/clients/dynamodb";

export enum InvoiceTransactionStatus {
    GENERATED = 'URL_GENERATED',
    RECEIVED = 'INVOICE_RECEIVED',
    PROCESSED = 'INVOICE_PROCESSED',
    TIMEOUT = 'TIMEOUT',
    CANCELED = 'INVOICE_CANCELED',
    NON_VALID_INVOICE_NUMBER = 'NON_VALID_INVOICE_NUMBER',
    NOT_FOUND = 'NOT_FOUND',
}

export interface InvoiceTransaction {
    pk: string;
    sk: string;
    ttl: number;
    requestId: string;
    timestamp: number;
    expiresIn: number;
    connectionId: string;
    wsEndpoint: string;
    transactionStatus: InvoiceTransactionStatus;
}

export class InvoiceTransactionRepository {
    constructor(
        private readonly ddbClient: DocumentClient,
        private readonly tableName: string
    ) {}

    async create(invoiceTransaction: InvoiceTransaction): Promise<InvoiceTransaction> {
        await this.ddbClient.put({
            TableName: this.tableName,
            Item: invoiceTransaction
        }).promise();

        return invoiceTransaction;
    }

    async findByTransaction(transactionId: string): Promise<InvoiceTransaction | null> {
        const data = await this.ddbClient.get({
            TableName: this.tableName,
            Key: {
                pk: '#transaction',
                sk: transactionId
            }
        }).promise();

        return data.Item ? data.Item as InvoiceTransaction : null;
    }

    async updateStatus(transactionId: string, status: InvoiceTransactionStatus): Promise<boolean> {
        try {
            await this.ddbClient.update({
                TableName: this.tableName,
                Key: {
                    pk: '#transaction',
                    sk: transactionId
                },
                ConditionExpression: 'attribute_exists(pk)',
                UpdateExpression: 'set transactionStatus = :status',
                ExpressionAttributeValues: { ':status': status }
            }).promise();
        } catch (error) {
            return false
        }

        return true;
    }
}
