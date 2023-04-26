import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDB, ApiGatewayManagementApi } from 'aws-sdk';
import * as AwsXRay from 'aws-xray-sdk';
import {
    InvoiceTransactionRepository,
    InvoiceTransactionStatus,
    InvoiceWSService
} from '/opt/nodejs/invoice-layer';

AwsXRay.captureAWS(require('aws-sdk'));

const invoiceTable = process.env.INVOICE_TABLE_NAME! as string;
const wsEndpoint = (process.env.INVOICE_WS_API_ENDPOINT! as string).substring(6);
const ddbClient = new DynamoDB.DocumentClient();
const wsClient = new ApiGatewayManagementApi({
    endpoint: wsEndpoint
});

const invoiceWebSocketService = new InvoiceWSService(wsClient);
const invoiceTransactionRepository = new InvoiceTransactionRepository(ddbClient, invoiceTable);

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    const transactionId = JSON.parse(event.body!).transactionId as string;
    const lambdaRequestId = context.awsRequestId;
    const webSocketConnectionId = event.requestContext.connectionId! as string;

    console.log(`Event: `, JSON.stringify(event, null, 2));
    console.log(`ConnectionId: ${lambdaRequestId} - Lambda RequestId: ${webSocketConnectionId}`);

    const transaction = await invoiceTransactionRepository.findByTransaction(transactionId);

    if (!transaction) {
        console.log(`Transaction not found: ${transactionId}`);

        await invoiceWebSocketService.sendInvoiceStatus(
            transactionId,
            webSocketConnectionId,
            InvoiceTransactionStatus.NOT_FOUND
        );

        await invoiceWebSocketService.disconnectClient(webSocketConnectionId);

        return { statusCode: 422, body: '' };
    }

    console.log(`Founded transaction: `, JSON.stringify(transaction, null, 2));

    if (transaction.transactionStatus !== InvoiceTransactionStatus.GENERATED) {
        console.error(`Can not cancel transaction: ${transactionId} - status: ${transaction.transactionStatus}`);
        await invoiceWebSocketService.sendInvoiceStatus(
            transactionId,
            webSocketConnectionId,
            InvoiceTransactionStatus.NOT_FOUND
        );
        await invoiceWebSocketService.disconnectClient(webSocketConnectionId);
        return { statusCode: 422, body: '' };
    }

    const sendMessage = invoiceWebSocketService.sendInvoiceStatus(
        transactionId,
        webSocketConnectionId,
        InvoiceTransactionStatus.CANCELED
    );

    const changeStatus = invoiceTransactionRepository.updateStatus(transactionId, InvoiceTransactionStatus.CANCELED);

    await Promise.all([sendMessage, changeStatus]);

    await invoiceWebSocketService.disconnectClient(webSocketConnectionId);

    console.log('Cancelled successfully.');

    return { statusCode: 204, body: '' };
}
