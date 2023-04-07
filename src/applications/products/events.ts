import { APIGatewayProxyResult, Callback, Context } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import * as AwsXRay from 'aws-xray-sdk';
import { ProductEvent } from '/opt/nodejs/products-events-layer';

AwsXRay.captureAWS(require('aws-sdk'));

const tableName = process.env.EVENTS_TABLE!;
const dynamoClient = new DynamoDB.DocumentClient();

export async function handler(
    event: ProductEvent,
    context: Context,
    callback: Callback
): Promise<void> {
    console.log(JSON.stringify({
        requestId: context.awsRequestId,
        event
    }));

    await createEvent(event);

    callback(null, JSON.stringify({
        code: 'CREATED',
        message: 'Event was created successfully.'
    }));
}

async function createEvent(event: ProductEvent) {
    const timestamp = Date.now();
    const ttl = ~~((timestamp / 1000) + (5 * 60));

    return dynamoClient.put({
        TableName: tableName,
        Item: {
            pk: `#product_${event.productId}`,
            sk: `${event.eventType}#${timestamp}`,
            email: event.email,
            createdAt: timestamp,
            requestId: event.requestId,
            eventType: event.eventType,
            info: {
                productId: event.productId,
                price: event.productPrice
            },
            ttl
        }
    }).promise();
}
