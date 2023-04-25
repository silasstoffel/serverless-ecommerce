import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import * as AwsXRay from 'aws-xray-sdk';
import { S3, DynamoDB, ApiGatewayManagementApi } from 'aws-sdk'
import { v4 as uuid } from 'uuid';
import { InvoiceTransactionRepository, InvoiceTransactionStatus, InvoiceWSService } from '/opt/nodejs/invoice-layer'

AwsXRay.captureAWS(require('aws-sdk'));

const invoiceTable = process.env.INVOICE_TABLE_NAME! as string;
const bucketName = process.env.INVOICE_BUCKET_NAME! as string;
const wsEndpoint = (process.env.INVOICE_WS_API_ENDPOINT! as string).substring(6);

const s3Client = new S3();
const ddbClient = new DynamoDB.DocumentClient();
const wsClient = new ApiGatewayManagementApi({
    endpoint: wsEndpoint
});
const invoiceWebSocketService = new InvoiceWSService(wsClient);

const invoiceTransactionRepository = new InvoiceTransactionRepository(ddbClient, invoiceTable);

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    console.log(event);

    const lambdaRequestId = context.awsRequestId;
    // identifier web socket connection
    const webSocketConnectionId = event.requestContext.connectionId! as string;

    console.log(`ConnectionId: ${lambdaRequestId} - Lambda RequestId: ${webSocketConnectionId}`);

    const expires = 5 * 60;
    const key = uuid();
    const url = await s3Client.getSignedUrlPromise('putObject', {
        Bucket: bucketName,
        Key: key,
        Expires: expires
    });

    // Create invoice transaction
    const timestamp = Date.now();
    const ttl = ~~(timestamp / 1000 + 60 * 2);
    await invoiceTransactionRepository.create({
        pk: '#transaction',
        sk: key,
        ttl,
        requestId: lambdaRequestId,
        transactionStatus: InvoiceTransactionStatus.GENERATED,
        timestamp,
        expiresIn: expires,
        connectionId: webSocketConnectionId,
        wsEndpoint: wsEndpoint
    });

    const data = {
        url,
        expires,
        transactionId: key
    };

    await invoiceWebSocketService.sendData(webSocketConnectionId, JSON.stringify(data));

    return { statusCode: 204, body: '' };
}
