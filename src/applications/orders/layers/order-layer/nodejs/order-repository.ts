import { DocumentClient } from 'aws-sdk/clients/dynamodb';

export enum ShippingType {
    FAST = 'FAST',
    ECONOMIC = 'ECONOMIC',
}

export enum Carrier {
    CORREIOS = 'CORREIOS',
    FEDEX = 'FEDEX',
}

export enum PaymentType {
    CASH = 'CASH',
    DEBIT_CARD = 'DEBIT_CARD',
    CREDIT_CARD = 'CREDIT_CARD'
}

export interface OrderProduct {   
    code: string;
    price: number;
};

export interface OrderShipping {   
    type: ShippingType;
    carrier: Carrier;
};


export interface Order {
    pk: string;
    sk?: string;    
    createdAt?: number;
    shipping: OrderShipping,
    billing: {
        payment: PaymentType,
        totalOrder: number
    },
    products?: OrderProduct[]
};

export class OrderRepository {

    public static readonly viewWithoutProduct = ['pk', 'sk', 'createdAt', 'shipping', 'billing'];

    public constructor(
        private readonly dynamoDbClient: DocumentClient,
        private readonly tableName: string
    ) {}

    public async findAll(attributes: string[] = []): Promise<Order[]> {
        const attrs = attributes.length ? attributes.join(',') : undefined;
        const data = await this.dynamoDbClient.scan({
            TableName: this.tableName,
            ProjectionExpression: attrs
        }).promise();

        return data.Items as Order[];
    }

    public async findByEmail(email: string, attributes: string[] = []): Promise<Order[]> {
        const attrs = attributes.length ? attributes.join(',') : undefined;
        const data = await this.dynamoDbClient.query({
            TableName: this.tableName,
            KeyConditionExpression: 'pk = :email',
            ExpressionAttributeValues: {
                ':email': email 
            },
            ProjectionExpression: attrs
        }).promise();

        return data.Items as Order[];
    }

    public async create(product: Order): Promise<Order> {
        await this.dynamoDbClient.put({
            TableName: this.tableName,
            Item: product
        }).promise();

        return product;
    }

    public async find(id: string, email: string, attributes: string[] = []): Promise<Order | null> {
        const attrs = attributes.length ? attributes.join(',') : undefined;
        const data = await this.dynamoDbClient.get({
            Key: { pk: email, sk: id },
            TableName: this.tableName,
            ProjectionExpression: attrs
        }).promise();

        return data.Item ? data.Item as Order: null;
    }    

    public async delete(id: string, email: string): Promise<Order> {
        const data = await this.dynamoDbClient.delete({
            TableName: this.tableName,
            Key: { pk: email, sk: id },
            ReturnValues: "ALL_OLD"
        }).promise();

        if (data.Attributes) {
            return data.Attributes as Order;
        }

        throw new Error('Order not found.');         
    }
}
