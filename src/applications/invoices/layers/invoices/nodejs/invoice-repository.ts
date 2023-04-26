import { DocumentClient } from "aws-sdk/clients/dynamodb";

export interface Invoice {
    pk: string;
    sk: string;
    totalValue: number;
    productId: string;
    quantity: number;
    transactionId: string;
    ttl: number;
    createdAt: number;
}

export interface InvoiceFile {
    customerName: number;
    invoiceNumber: string;
    totalValue: number;
    productId: string;
    quantity: number;
}

export class InvoiceRepository {
    constructor(
        private readonly ddbClient: DocumentClient,
        private readonly tableName: string
    ) {}

    async create(invoice: Invoice): Promise<Invoice> {
        await this.ddbClient.put({
            TableName: this.tableName,
            Item: invoice
        }).promise();

        return invoice;
    }
}
