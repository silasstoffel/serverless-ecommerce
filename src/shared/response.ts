import { APIGatewayProxyResult } from 'aws-lambda';

export async function jsonResponse(status = 200, body?: any): Promise<APIGatewayProxyResult> {
    const payload = body ? JSON.stringify(body) : '';
    return { body: payload, statusCode: status };
};
