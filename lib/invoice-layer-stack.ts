import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as systemManager from 'aws-cdk-lib/aws-ssm';

export class InvoiceLayerStack extends cdk.Stack {

    public constructor(scope: Construct, id: string, props?: cdk.StackProps) {
      super(scope, id, props);

      const invoiceLayer = new lambda.LayerVersion(this, "InvoiceLayer",  {
        code: lambda.Code.fromAsset('./src/applications/invoices/layers/invoices'),
        compatibleRuntimes: [lambda.Runtime.NODEJS_16_X],
        layerVersionName: 'InvoiceLayer',
        removalPolicy: cdk.RemovalPolicy.DESTROY
      });

      // Store layer ARN in AWS System manager
      new systemManager.StringParameter(this, 'InvoiceLayerVersionArn', {
        parameterName: 'InvoiceLayerVersionArn',
        stringValue: invoiceLayer.layerVersionArn
      });
    }
}
