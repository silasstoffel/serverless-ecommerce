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
