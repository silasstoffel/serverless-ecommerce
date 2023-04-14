import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as systemManager from 'aws-cdk-lib/aws-ssm';

export class OrderLayerStack extends cdk.Stack {

    public constructor(scope: Construct, id: string, props?: cdk.StackProps) {
      super(scope, id, props);

      const orderLayer = new lambda.LayerVersion(this, "OrderLayer",  {
        code: lambda.Code.fromAsset('./src/applications/orders/layers/order-layer'),
        compatibleRuntimes: [lambda.Runtime.NODEJS_16_X],
        layerVersionName: 'OrderLayer',
        removalPolicy: cdk.RemovalPolicy.DESTROY
      });

      // Store layer ARN in AWS System manager
      new systemManager.StringParameter(this, 'OrderLayerVersionArn', {
        parameterName: 'OrderLayerVersionArn',
        stringValue: orderLayer.layerVersionArn,
      });

      const orderEventLayer = new lambda.LayerVersion(this, "OrderEventsLayer",  {
        code: lambda.Code.fromAsset('./src/applications/orders/layers/order-events-layer'),
        compatibleRuntimes: [lambda.Runtime.NODEJS_16_X],
        layerVersionName: 'OrderEventsLayer',
        removalPolicy: cdk.RemovalPolicy.DESTROY
      });

      // Store layer ARN in AWS System manager
      new systemManager.StringParameter(this, 'OrderEventsLayerVersionArn', {
        parameterName: 'OrderEventsLayerVersionArn',
        stringValue: orderEventLayer.layerVersionArn,
      });
    }
}
