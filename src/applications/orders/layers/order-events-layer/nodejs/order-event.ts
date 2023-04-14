import { DocumentClient } from "aws-sdk/clients/dynamodb";

export enum OrderEventType {
    CREATED = 'CREATED',
    DELETED = 'DELETED',
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
}
