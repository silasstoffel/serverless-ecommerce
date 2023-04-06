import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import * as AwsXRay from 'aws-xray-sdk';
import { Product, ProductRepository } from '/opt/nodejs/products-layer';
import { jsonResponse } from 'src/shared/response';

AwsXRay.captureAWS(require('aws-sdk'));

const tableName = process.env.PRODUCTS_TABLE!;
const dynamoDb = new DynamoDB.DocumentClient();
const productRepository = new ProductRepository(dynamoDb, tableName);

export async function handler(
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyResult> {
    const method = event.httpMethod;
    const lambdaRequestId = context.awsRequestId;
    const contextId = event.requestContext;
    const resource = event.resource;
    
    console.log(JSON.stringify({
        method,
        resource,
        contextId,
        lambdaRequestId,
        payload: event?.body
    }, null, 2));

    
    if (resource === '/products') {
        const product = JSON.parse(event.body!) as Product;
        console.log("Creating product");
        const data = await productRepository.create(product);
        return jsonResponse(201, data);
    }
    
    if (resource === '/products/{id}') {            
        const productId = event.pathParameters!.id as string;
        if (method === 'PUT') {
            const product = JSON.parse(event.body!) as Product;
            console.log("Updating product");

            try {
                await productRepository.update(productId, product);
                return jsonResponse(204);
            } catch (err) {
                console.error((<Error>err).message);
                return jsonResponse(404, { code: 'NOT_FOUND', message: 'Product not found.' });
            }
        }

        try {
            await productRepository.delete(productId);
            return jsonResponse(204);
        } catch (err) {
            const message = (<Error>err).message;
            console.error(message);
            return jsonResponse(404, { code: 'PROCESSING_FAILURE', message });
        }
    }

    return jsonResponse(422, {
        code: 'INVALID_RESOURCE',
        message: 'Invalid resource requested'
    });
}
