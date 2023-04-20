import { Context, APIGatewayProxyResult, APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import * as AwsXRay from 'aws-xray-sdk';
import { OrderEventRepository } from '/opt/nodejs/orders-events-layer';

AwsXRay.captureAWS(require('aws-sdk'));

const eventsTable = process.env.EVENTS_TABLE!;

const dynamoDb = new DynamoDB.DocumentClient();
const orderEventsRepository = new OrderEventRepository(dynamoDb, eventsTable);

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const email = event.queryStringParameters!.email as string;
    const eventType = event.queryStringParameters?.eventType ? event.queryStringParameters.eventType as string : undefined;

    const data = await orderEventsRepository.findByEmailAndEventType(email, eventType);

    return {
        statusCode: 200,
        body: JSON.stringify(data)
    };
}
