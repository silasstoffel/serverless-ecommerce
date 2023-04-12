import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as LambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as systemManager from 'aws-cdk-lib/aws-ssm';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sub from 'aws-cdk-lib/aws-sns-subscriptions';

export class OrderAppStack extends cdk.Stack {
    public readonly ordersHandler: LambdaNode.NodejsFunction;
    
    private productLayer: lambda.ILayerVersion;
    private orderLayer: lambda.ILayerVersion;
    private orderEventLayer: lambda.ILayerVersion;
    private orderTable: dynamodb.Table;
    private orderEventsTopic: sns.Topic;

    public constructor(
        scope: Construct,
        id: string,
        private readonly props: OrderAppStackProps
    ) {
      super(scope, id, props);      
      
      this.createOrdersTable();
      this.createLayers();
      this.createTopics();

      this.ordersHandler = this.buildOrdersLambda();
      this.orderEventsTopic.grantPublish(this.ordersHandler);

      this.createPermissions();
    }

    private buildOrdersLambda(): LambdaNode.NodejsFunction {
        const resourceId = 'Orders';

        return new LambdaNode.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/orders/orders.ts',
          handler: 'handler',
          memorySize: 128,
          timeout: cdk.Duration.seconds(5),
          bundling: {
              minify: true,
              sourceMap: false,
          },
          logRetention: RetentionDays.THREE_DAYS,
          environment: {
            PRODUCTS_TABLE: this.props.productTable.tableName,
            ORDERS_TABLE: this.orderTable.tableName,
            ORDER_EVENTS_TOPIC_ARN: this.orderEventsTopic.topicArn
          },
          runtime: lambda.Runtime.NODEJS_16_X,
          layers: [
            this.productLayer,
            this.orderLayer,
            this.orderEventLayer
          ],
          tracing: lambda.Tracing.ACTIVE,
          insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0
        });
    }

    private createOrdersTable(resourceId = 'OrdersDynamoDb', tableName = 'orders'): void {
        this.orderTable = new dynamodb.Table(this, resourceId, {
            tableName,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            partitionKey: {
                name: 'pk',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'sk',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1
        });
    }

    private createLayers(): void {
        this.productLayer = lambda.LayerVersion.fromLayerVersionArn(
            this,
            'ProductLayerVersionArn',
            systemManager.StringParameter.valueForStringParameter(this, 'ProductLayerVersionArn')
        );

        this.orderLayer = lambda.LayerVersion.fromLayerVersionArn(
            this,
            'OrderLayerVersionArn',
            systemManager.StringParameter.valueForStringParameter(this, 'OrderLayerVersionArn')
        );

        this.orderEventLayer = lambda.LayerVersion.fromLayerVersionArn(
            this,
            'OrderEventLayerVersionArn',
            systemManager.StringParameter.valueForStringParameter(this, 'OrderEventLayerVersionArn')
        );
    }

    private createPermissions() {
        this.orderTable.grantReadWriteData(this.ordersHandler);
        // Adding read permission for external table (product context).
        this.props.productTable.grantReadData(this.ordersHandler);
    }

    private createTopics() {
        this.orderEventsTopic = new sns.Topic(this, 'OrderEventsTopic', {
            displayName: 'Order events topic',
            topicName: 'order-events',                        
        });
    }
}

export interface OrderAppStackProps extends cdk.StackProps {
    productTable: dynamodb.Table
}
