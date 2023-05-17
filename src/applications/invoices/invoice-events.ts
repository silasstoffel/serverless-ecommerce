import { AttributeValue, DynamoDBStreamEvent, Context } from "aws-lambda";
import * as AwsXRay from 'aws-xray-sdk';
import { DynamoDB, ApiGatewayManagementApi, EventBridge } from 'aws-sdk'
import { InvoiceWSService } from '/opt/nodejs/invoice-layer'
import {  } from "aws-cdk-lib/aws-appsync";

AwsXRay.captureAWS(require('aws-sdk'));

const eventsTable = process.env.EVENTS_TABLE_NAME! as string;
const wsEndpoint = (process.env.INVOICE_WS_API_ENDPOINT! as string).substring(6);
const auditBusName = process.env.AUDIT_BUS_NAME!;

const ddbClient = new DynamoDB.DocumentClient();
const wsClient = new ApiGatewayManagementApi({
    endpoint: wsEndpoint
});
const eventBridgeClient = new EventBridge();

const invoiceWebSocketService = new InvoiceWSService(wsClient);

export async function handler(event: DynamoDBStreamEvent, context: Context): Promise<void> {
    const promises: Promise<void>[] = [];
    event.Records.forEach((record) => {
        console.log('Received dynamoDb event. Type: ' + record.eventName);
        console.log('NewImage:', JSON.stringify(record.dynamodb?.NewImage || {}, null, 2));
        console.log('OldImage:', JSON.stringify(record.dynamodb?.OldImage || {}, null, 2));

        if (record.eventName === 'INSERT' && record.dynamodb!.NewImage!.pk!.S!.startsWith('#invoice')) {
            console.log(record?.dynamodb?.NewImage)
            console.log('Invoice insert event received');
            promises.push(createEvent(record.dynamodb!.NewImage!, 'INVOICE_CREATED'));
        }

        if (record.eventName === 'REMOVE' && record.dynamodb!.OldImage!.pk!.S!.startsWith('#transaction')) {
            console.log('Transaction remove event received');
            promises.push(expireTransaction(record.dynamodb!.OldImage!));
        }

    });

    await Promise.all(promises);
    return;
}

async function createEvent(invoiceImage: {[ key: string]: AttributeValue}, eventType: string): Promise<void> {
    const timestamp = Date.now();
    const ttl = ~~(timestamp / 100 + 60 * 60);
    await ddbClient.put({
        TableName: eventsTable,
        Item: {
            pk: `#invoice_${invoiceImage.sk.S}`,
            sk: `${eventType}#${timestamp}`,
            ttl,
            email: invoiceImage.pk.S!.split('_')[1],
            createdAt: timestamp,
            eventType,
            info: {
                transaction: invoiceImage.transactionId.S,
                productId: invoiceImage.productId.S,
                quantity: invoiceImage.quantity.N
            }
        }
    }).promise();
}

async function expireTransaction(transactionImage: {[ key: string]: AttributeValue}): Promise<void> {
    const transactionId = transactionImage.sk.S!;
    const connectionId = transactionImage.connectionId.S!;

    console.log('Expire Transaction');
    console.log(`Transaction: ${transactionId} - Connection: ${connectionId}`);

    const transactionStatus = transactionImage.transactionStatus.S!
    if (transactionStatus !== 'INVOICE_PROCESSED') {
        console.log(`Invoice import failed. Transaction Status: ${transactionStatus}`);

        const putEvent = eventBridgeClient.putEvents({
            Entries: [{
                Source: 'app.invoice',
                EventBusName: auditBusName,
                DetailType: 'invoice',
                Time: new Date(),
                Detail: JSON.stringify({
                    errorDetail: 'TIMEOUT',
                    transactionId,
                    connectionId
                })
            }]
        }).promise()

        const sendStatus = invoiceWebSocketService.sendInvoiceStatus(transactionId, connectionId, 'TIMEOUT')

        await Promise.all([putEvent, sendStatus])
    }
    await invoiceWebSocketService.disconnectClient(connectionId);
}
