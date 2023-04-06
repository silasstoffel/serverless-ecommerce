import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as systemManager from 'aws-cdk-lib/aws-ssm';

export class ProductLayerStack extends cdk.Stack {
    public readonly productLayer: lambda.LayerVersion;

    public constructor(scope: Construct, id: string, props?: cdk.StackProps) {
      super(scope, id, props);

      this.productLayer = new lambda.LayerVersion(this, "ProductLayer",  {
        code: lambda.Code.fromAsset('./src/applications/products/layers/products-layer'),
        compatibleRuntimes: [lambda.Runtime.NODEJS_16_X],
        layerVersionName: 'ProductLayer',
        removalPolicy: cdk.RemovalPolicy.DESTROY
      });

      // Store layer ARN in  AWS System manager
      new systemManager.StringParameter(this, 'ProductLayerVersionArn', {
        parameterName: 'ProductLayerVersionArn',
        stringValue: this.productLayer.layerVersionArn
      });
    }
}
