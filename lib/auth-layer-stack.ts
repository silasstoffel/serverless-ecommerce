import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as systemManager from 'aws-cdk-lib/aws-ssm';

export class AuthLayerStack extends cdk.Stack {

    public constructor(scope: Construct, id: string, props?: cdk.StackProps) {
      super(scope, id, props);

      const authUserInfoLayer = new lambda.LayerVersion(this, "AuthUserInfoLayer",  {
        code: lambda.Code.fromAsset('./src/applications/auth/layers/auth-user-info'),
        compatibleRuntimes: [lambda.Runtime.NODEJS_16_X],
        layerVersionName: 'AuthUserInfoLayer',
        removalPolicy: cdk.RemovalPolicy.DESTROY
      });

      // Store layer ARN in AWS System manager
      new systemManager.StringParameter(this, 'AuthUserInfoLayerVersionArn', {
        parameterName: 'AuthUserInfoLayerVersionArn',
        stringValue: authUserInfoLayer.layerVersionArn
      });
    }
}
