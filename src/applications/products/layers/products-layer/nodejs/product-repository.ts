import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import { v4 as uuid } from 'uuid'

export interface Product {
    id: string;
    productName: string;    
    code: string;
    price: number;
    model: string;
    productUrl: string;
};

export class ProductRepository {
    public constructor(
        private readonly dynamoDbClient: DocumentClient,
        private readonly tableName: string
    ) {}

    public async findAll(): Promise<Product[]> {
        const data = await this.dynamoDbClient.scan({
            TableName: this.tableName,                      
        }).promise();

        return data.Items as Product[];
    }

    public async find(id: string): Promise<Product | null> {
        const data = await this.dynamoDbClient.get({
            Key: { id },
            TableName: this.tableName, 
        }).promise();

        return data.Item ? data.Item as Product: null;
    }

    public async findByIds(ids: string[]): Promise<Product[]> {        
        const keys: { id: string }[] = [];
        ids.forEach((id) => keys.push({ id }));

        const records = await this.dynamoDbClient.batchGet({
             RequestItems: {
                [this.tableName]: { Keys: keys }
             }
        }).promise();

        return records.Responses![this.tableName] as Product[];
    }    

    public async create(product: Product): Promise<Product> {
        product.id = uuid();
        await this.dynamoDbClient.put({
            TableName: this.tableName,
            Item: product
        }).promise();

        return product;
    }

    public async delete(id: string): Promise<Product> {
        const data = await this.dynamoDbClient.delete({
            TableName: this.tableName,
            Key: { id },
            ReturnValues: "ALL_OLD"
        }).promise();

        if (data.Attributes) {
            return data.Attributes as Product;
        }

        throw new Error('Product not found.');         
    }
    
    public async update(id: string, product: Product): Promise<Product> {        
        const data = await this.dynamoDbClient.update({
            TableName: this.tableName,
            Key: { id },
            ConditionExpression: 'attribute_exists(id)',
            ReturnValues: 'UPDATED_NEW',
            UpdateExpression: 'set productName = :name, code = :code, price = :price, model = :model, productUrl = :url',
            ExpressionAttributeValues: {
                ':name': product.productName,
                ':code': product.code,
                ':price': product.price,
                ':model': product.model,
                ':url': product.productUrl
            }
        }).promise();

        return {...data.Attributes, id } as Product;
    }
}
