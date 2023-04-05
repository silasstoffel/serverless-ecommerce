import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { HttpMethod } from "aws-cdk-lib/aws-events";
import { jsonResponse } from '../../shared/response';


export async function handler(
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyResult> {
    const method = event.httpMethod;
    const lambdaRequestId = context.awsRequestId;
    const contextId = event.requestContext;
    const resource = event.resource

    console.log(JSON.stringify({
        method,
        resource,
        contextId,
        lambdaRequestId
    }, null, 2));


    if (resource === '/products') {
        return jsonResponse(201);
    }

    if (resource === '/products/{id}') {                
        
        if (method === 'PUT') {
            return jsonResponse(204);
        }

        return jsonResponse(204);
    }

    return jsonResponse(422, {
        code: 'INVALID_RESOURCE',
        message: 'Invalid resource requested'
    });
}
