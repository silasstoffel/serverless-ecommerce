import { DocumentClient } from "aws-sdk/clients/dynamodb";

export enum OrderEventType {
    CREATED = 'ORDER_CREATED',
    DELETED = 'ORDER_DELETED',
};

export interface OrderEventSchema {
    eventType: OrderEventType;
    occurredAt: Date;
    data: string;
};

export interface OrderEvent {
    email: string;
    orderId: string;
    createdAt?: number;
    shipping: {
        type: string,
        carrier: string
    },
    billing: {
        payment: string,
        totalOrder: number
    },
    productCodes: string[],
    requestId: string
};

export interface CreateOrderEventSchema {
    pk: string;
    sk: string;
    ttl: number;
    email: string;
    createdAt?: number;
    requestId: string;
    eventType: string;
    info: {
        orderId: string;
        productCodes: string[],
        messageId: string
    }
}

export class OrderEventRepository {
    constructor(
        private dynamoClient: DocumentClient,
        private tableName: string
    ) {}

    create(event: CreateOrderEventSchema) {
        return this.dynamoClient.put({
            TableName: this.tableName,
            Item: event
        }).promise();
    }

    async findByEmailAndEventType(email: string, eventType?: string): Promise<OrderEvent[]> {

        const condition = 'email = :email AND begins_with(sk, :prefix)';
        let params = { ':email': email, ':prefix': 'ORDER_' };

        if (eventType) {
            Object.assign(params, { ':prefix': eventType });
        }

        console.log(JSON.stringify({
            condition,
            params
        }, null, 2));

        const records = await this.dynamoClient.query({
            TableName: this.tableName,
            IndexName: 'eventsEmailGSI',
            KeyConditionExpression: condition,
            ExpressionAttributeValues: params
        }).promise();

        return records.Items as OrderEvent[];
    }
}
