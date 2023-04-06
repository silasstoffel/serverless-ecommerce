import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { ProductRepository } from '/opt/nodejs/products-layer';
import { jsonResponse } from 'src/shared/response';

const tableName = process.env.PRODUCTS_TABLE!;
const dynamoDb = new DynamoDB.DocumentClient();
const productRepository = new ProductRepository(dynamoDb, tableName);

export async function handler(
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyResult> {
    const method = event.httpMethod;
    const lambdaRequestId = context.awsRequestId;
    const contextId = event.requestContext

    console.log(JSON.stringify({
        method,
        resource: event.resource,
        contextId,
        lambdaRequestId
    }, null, 2));

    if (event.resource === '/products') {
        const products = await productRepository.findAll();
        return jsonResponse(200, products);
    }

    const id = event.pathParameters!.id as string;
    const product = await productRepository.find(id);
    if (!product) {
        return jsonResponse(404, { code: 'NOT_FOUND', message: `Product (${id}) not found.`});
    }

    return {
        statusCode: 200,
        body: JSON.stringify(product),
    };
}
