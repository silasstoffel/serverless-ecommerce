import { SNSEvent, Context } from 'aws-lambda';
import * as AwsXRay from 'aws-xray-sdk';

AwsXRay.captureAWS(require('aws-sdk'));

export async function handler(event: SNSEvent, context: Context): Promise<void> {
    event.Records.forEach((record) => {
        console.log(record.Sns);
    });
}
