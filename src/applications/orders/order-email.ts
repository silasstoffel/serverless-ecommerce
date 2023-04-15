import { SQSEvent, Context } from 'aws-lambda';
import * as AwsXRay from 'aws-xray-sdk';

AwsXRay.captureAWS(require('aws-sdk'));

export async function handler(event: SQSEvent, context: Context): Promise<void> {
    event.Records.forEach((record) => {
        console.log('Received message');
        const body = JSON.parse(record.body);
        console.log('Message Body', body);
    });
    
    return;
}
