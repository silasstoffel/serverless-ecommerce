import { SQSEvent, Context, SNSMessage } from 'aws-lambda';
import * as AwsXRay from 'aws-xray-sdk';
import { AWSError, SES } from 'aws-sdk';
import { OrderEvent, OrderEventSchema } from '/opt/nodejs/orders-events-layer';
import { PromiseResult } from 'aws-sdk/lib/request';

AwsXRay.captureAWS(require('aws-sdk'));

const sesClient = new SES();
const emailFrom = process.env.EMAIL_FROM! as string;

export async function handler(event: SQSEvent, context: Context): Promise<void> {
    const promises: Promise<PromiseResult<SES.SendEmailResponse, AWSError>>[] = [];
    event.Records.forEach((record) => {
        const body = JSON.parse(record.body) as SNSMessage;
        promises.push(sendMail(body));
    });
    
    await Promise.all(promises);
    console.log('Sent email...');
}

async function sendMail(message: SNSMessage) {
    const envelope = JSON.parse(message.Message) as OrderEventSchema;
    const event = JSON.parse(envelope.data) as OrderEvent;
    console.log('Sending mail to: ' + event.email);
    return sesClient.sendEmail({
        Destination: {
            ToAddresses: [event.email]
        },
        Message: {
            Body: {
                Text: {
                    Charset: 'UTF-8',
                    Data: `Pedido de n° ${event.orderId} criado com sucesso.`
                }
            },
            Subject: {
                Charset: 'UTF-8',
                Data: `Serverless E-Commerce - Novo Pedido`
            }
        },
        Source: emailFrom,
        ReplyToAddresses: [emailFrom]
    }).promise();
}
