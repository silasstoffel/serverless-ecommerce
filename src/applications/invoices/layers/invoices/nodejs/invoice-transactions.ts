import { DocumentClient } from "aws-sdk/clients/dynamodb";

export enum InvoiceTransactionStatus {
    GENERATED = 'URL_GENERATED',
    RECEIVED = 'INVOICE_RECEIVED',
    PROCESSED = 'INVOICE_PROCESSED',
    TIMEOUT = 'TIMEOUT',
    CANCELED = 'INVOICE_CANCELED',
    NON_VALID_INVOICE_NUMBER = 'NON_VALID_INVOICE_NUMBER',

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

    async create(invoice: InvoiceTransaction): Promise<InvoiceTransaction> {
        await this.ddbClient.put({
            TableName: this.tableName,
            Item: invoice
        }).promise();

        return invoice;
    }
}
