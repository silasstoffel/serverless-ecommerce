import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as AwsXRay from 'aws-xray-sdk';

AwsXRay.captureAWS(require('aws-sdk'));

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    console.log(JSON.stringify(event, null, 2));
    const message = 'Processed';
    const code = 'EVENT_PROCESSED';
    return {
        statusCode: 200,
        body: JSON.stringify({ code, message }),
    };
}
