import { APIGatewayProxyResult, S3Event, S3EventRecord } from 'aws-lambda';
import * as AwsXRay from 'aws-xray-sdk';
import { S3, DynamoDB, ApiGatewayManagementApi, EventBridge } from 'aws-sdk';
import {
    InvoiceTransactionRepository,
    InvoiceTransactionStatus,
    InvoiceWSService,
    InvoiceRepository,
    InvoiceFile
} from '/opt/nodejs/invoice-layer';

AwsXRay.captureAWS(require('aws-sdk'));

const invoiceTable = process.env.INVOICE_TABLE_NAME! as string;
const wsEndpoint = (process.env.INVOICE_WS_API_ENDPOINT! as string).substring(6);
const auditBusName = process.env.AUDIT_BUS_NAME!;

const s3Client = new S3();
const ddbClient = new DynamoDB.DocumentClient();
const wsClient = new ApiGatewayManagementApi({
    endpoint: wsEndpoint
});
const eventBridgeClient = new EventBridge();

const invoiceWebSocketService = new InvoiceWSService(wsClient);
const invoiceTransactionRepository = new InvoiceTransactionRepository(ddbClient, invoiceTable);
const invoiceRepository = new InvoiceRepository(ddbClient, invoiceTable);

export async function handler(event: S3Event): Promise<void> {
    const promises: Promise<void>[] = [];

    event.Records.forEach(record => {
        promises.push(processRecord(record));
    });

    await Promise.all(promises);
};

async function processRecord(record: S3EventRecord): Promise<APIGatewayProxyResult> {
    const key = record.s3.object.key;
    try {
        const transaction = await invoiceTransactionRepository.findByTransaction(key);
        if (!transaction) {
            throw new Error(`Transaction ${key} not found on database.`);
        }

        if (transaction.transactionStatus !== InvoiceTransactionStatus.GENERATED) {
            await invoiceWebSocketService.sendInvoiceStatus(
                key,
                transaction.connectionId,
                transaction.transactionStatus
            );
            const data = { key, transactionId: transaction.pk, status: transaction.transactionStatus };
            console.info(`Non valid transaction status: ${JSON.stringify(data)}`);
            await invoiceWebSocketService.disconnectClient(transaction.connectionId);

            return { statusCode: 422, body: '' };
        }

        await Promise.all([
            invoiceWebSocketService.sendInvoiceStatus(key, transaction.connectionId, InvoiceTransactionStatus.RECEIVED),
            invoiceTransactionRepository.updateStatus(key, InvoiceTransactionStatus.RECEIVED)
        ]);

        const file = await s3Client.getObject({ Key: key, Bucket: record.s3.bucket.name }).promise();

        const invoice = JSON.parse(file.Body!.toString('utf-8')) as InvoiceFile;

        if (!invoice.invoiceNumber || invoice.invoiceNumber.length < 5) {
            const status = InvoiceTransactionStatus.NON_VALID_INVOICE_NUMBER;

            const putEventPromise = eventBridgeClient.putEvents({
                Entries: [{
                    Source: 'app.invoice',
                    EventBusName: auditBusName,
                    DetailType: 'invoice',
                    Time: new Date(),
                    Detail: JSON.stringify({
                        errorDetail: 'FAIL_NO_INVOICE_NUMBER',
                        info: {
                            invoiceKey: key,
                            customerName: invoice.customerName
                        }
                    })
                }]
            }).promise()

            await Promise.all([
                invoiceWebSocketService.sendInvoiceStatus(key, transaction.connectionId, status),
                invoiceTransactionRepository.updateStatus(key, status),
                invoiceWebSocketService.sendData(transaction.connectionId, JSON.stringify({
                    message: 'Invoice number should be greater than 4'
                })),
                putEventPromise
            ]);

            await invoiceWebSocketService.disconnectClient(transaction.connectionId);

            console.log('Put event result', put);

            return { statusCode: 422, body: '' };
        }

        const create = invoiceRepository.create({
            pk: `#invoice_${invoice.customerName}`,
            sk: invoice.invoiceNumber.toString(),
            totalValue: invoice.totalValue,
            productId: invoice.productId,
            quantity: invoice.quantity,
            transactionId: key,
            ttl: 0,
            createdAt: Date.now()
        });

        const remove = s3Client.deleteObject({ Key: key, Bucket: record.s3.bucket.name }).promise();

        const updateStatus = invoiceTransactionRepository.updateStatus(key, InvoiceTransactionStatus.PROCESSED);

        const sendMessage = invoiceWebSocketService.sendInvoiceStatus(key, transaction.connectionId, InvoiceTransactionStatus.PROCESSED);

        await Promise.all([create, remove, updateStatus, sendMessage]);

        await invoiceWebSocketService.disconnectClient(transaction.connectionId);

        return { statusCode: 204, body: '' };

    } catch (err) {
        console.error(`Error to process s3 record: ${(<Error> err).message} - key: ${key}`);
    }
}
