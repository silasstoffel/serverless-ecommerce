import { S3Event, Context } from "aws-lambda";
import { S3 } from 'aws-sdk'
import * as AwsXRay from 'aws-xray-sdk';

AwsXRay.captureAWS(require('aws-sdk'));

const s3Client = new S3();

export const handler = async (event: S3Event, context: Context): Promise<void> => {
    // https://www.cloudtechsimplified.com/aws-lambda-s3/
    console.log(`Context.`, JSON.stringify(context, null, 2));
    console.log(`Environment.`, JSON.stringify(process?.env || {}, null, 2));

    for (const record of event.Records) {
      console.log(`Received an object.`, JSON.stringify(record, null, 2));

      const bucketName = record?.s3?.bucket?.name || '';
      const objectKey = record?.s3?.object?.key || '';
      const params = { Bucket: bucketName, Key: objectKey };

      await s3Client.deleteObject(params).promise();
    }

    console.log(`Object deleted.`);
    return;
  };
