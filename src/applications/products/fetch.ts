import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { HttpMethod } from "aws-cdk-lib/aws-events";

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

    const products = [
        { id: '1', name: 'MacBook Pro', price: 21000.00 },
        { id: '2', name: 'MacBook Air', price: 14000.00 },
        { id: '3', name: 'iPad Air', price: 4000.00 },
    ];

    if (event.resource === '/products') {
        return {
            statusCode: 200,
            body: JSON.stringify(products),
        };
    }

    const id = event.pathParameters!.id as string;
    const product = products.find(item => item.id === id);
    
    if (!product) {
        return {
            statusCode: 404,
            body: JSON.stringify({ code: 'NOT_FOUND', message: `Product (${id}) not found.`}),
        };
    }

    return {
        statusCode: 200,
        body: JSON.stringify(product),
    };
}
