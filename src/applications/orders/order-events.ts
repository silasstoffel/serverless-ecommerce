import { SNSEvent, SNSMessage, Context } from 'aws-lambda';
import { AWSError, DynamoDB } from 'aws-sdk';
import * as AwsXRay from 'aws-xray-sdk';
import { PromiseResult } from 'aws-sdk/lib/request';
import {
    CreateOrderEventSchema,
    OrderEvent,
    OrderEventRepository,
    OrderEventSchema
} from '/opt/nodejs/orders-events-layer';

AwsXRay.captureAWS(require('aws-sdk'));

const eventsTable = process.env.EVENTS_TABLE!;

const dynamoDb = new DynamoDB.DocumentClient();
const orderEventsRepository = new OrderEventRepository(dynamoDb, eventsTable);

export async function handler(event: SNSEvent, context: Context): Promise<void> {
    const promises: Promise<PromiseResult<DynamoDB.DocumentClient.PutItemOutput, AWSError>>[] = []

    event.Records.forEach(record => {
        promises.push(createEvent(record.Sns))
    });

    await Promise.all(promises);
}

async function createEvent(event: SNSMessage) {
    const fullMessage = JSON.parse(event.Message) as OrderEventSchema;
    const messageData = JSON.parse(fullMessage.data) as OrderEvent;
    console.log(`Order Event - MessageId: ${event.MessageId}`);

    const ts = Date.now();
    const ttl = ~~(ts / 1000 + (5 * 60));

    const data: CreateOrderEventSchema = {
        pk: `#order_${messageData.orderId}`,
        sk: `${fullMessage.eventType}_${ts}`,
        ttl,
        email: messageData.email,
        createdAt: ts,
        requestId: messageData.requestId,
        eventType: fullMessage.eventType,
        info: {
            orderId: messageData.orderId,
            productCodes: messageData.productCodes,
            messageId: event.MessageId
        }
    };

    return orderEventsRepository.create(data);
}
