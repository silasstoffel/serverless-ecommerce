import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDB, Lambda } from 'aws-sdk';
import * as AwsXRay from 'aws-xray-sdk';
import { Product, ProductRepository } from '/opt/nodejs/products-layer';
import { ProductEvent, ProductEventType } from '/opt/nodejs/products-events-layer';
import { jsonResponse } from 'src/shared/response';

AwsXRay.captureAWS(require('aws-sdk'));

const tableName = process.env.PRODUCTS_TABLE!;
const invokeFuncName = process.env.PRODUCTS_EVENTS_FUNC_NAME!;

const dynamoDb = new DynamoDB.DocumentClient();
const lambdaClient = new Lambda();
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
        const invokeSyncResult = await produceEvent(data, ProductEventType.CREATED, 'silasstofel@gmail.com', lambdaRequestId);
        console.log('Invoke Sync Lambda: ',  JSON.stringify(invokeSyncResult, null, 2));
        return jsonResponse(201, data);
    }
    
    if (resource === '/products/{id}') {            
        const productId = event.pathParameters!.id as string;
        if (method === 'PUT') {
            const product = JSON.parse(event.body!) as Product;
            console.log("Updating product");

            try {
                await productRepository.update(productId, product);
                const invokeSyncResult = await produceEvent(product, ProductEventType.UPDATED, 'silasstofel@hotmail.com', lambdaRequestId);
                console.log('Invoke Sync Lambda: ',  JSON.stringify(invokeSyncResult, null, 2));
                return jsonResponse(204);
            } catch (err) {
                console.error((<Error>err).message);
                return jsonResponse(404, { code: 'NOT_FOUND', message: 'Product not found.' });
            }
        }

        try {
            const data = await productRepository.delete(productId);
            const invokeSyncResult = await produceEvent(data, ProductEventType.DELETE, 'silas.stoffel@loft.com.br', lambdaRequestId);
            console.log('Invoke Sync Lambda: ',  JSON.stringify(invokeSyncResult, null, 2));
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

async function produceEvent(
    product: Product, 
    eventType: ProductEventType, 
    email: string, 
    lambdaRequestId: string
) {
    const payload: ProductEvent = {
        email,
        eventType,
        productCode: product.code,
        productId: product.id,
        productPrice: product.price,
        requestId: lambdaRequestId
    };

    return lambdaClient.invoke({
        FunctionName: invokeFuncName,
        Payload: JSON.stringify(payload),
        //InvocationType: 'RequestResponse' // sync,
        InvocationType: 'Event' // async
    }).promise();
}
