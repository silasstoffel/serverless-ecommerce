import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as LambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as systemManager from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';

export class ProductAppStack extends cdk.Stack {
    public readonly productLoadHandler: LambdaNode.NodejsFunction;
    public readonly productsAdministrationHandler: LambdaNode.NodejsFunction;
    public readonly productsEventsHandler: LambdaNode.NodejsFunction;
    public readonly productsTable: dynamodb.Table;
    private productLayer: lambda.ILayerVersion;
    private productEventsLayer: lambda.ILayerVersion;
    private authUserInfoLayer: lambda.ILayerVersion;

    public constructor(
        scope: Construct,
        id: string,
        private readonly props: ProductAppStackProps
    ) {
      super(scope, id, props);

      this.initLayers();

      this.productsEventsHandler = this.buildProductEventsFunction();

      this.productsTable = this.buildProductsTable();
      this.productLoadHandler = this.buildFetchProductsFunction();
      this.productsAdministrationHandler = this.buildAdminProductsFunction();

      this.setPermissions();
    }

    private setPermissions(): void {
        // Grant PutItem from productsEventsHandler
        const police = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:PutItem'],
            resources: [this.props.eventsTable.tableArn],
            conditions: {
                ['ForAllValues:StringLike']: {
                    'dynamodb:LeadingKeys': ['#product_*']
                }
            }
        });
        this.productsEventsHandler.addToRolePolicy(police);

        // IAM read/write data from products table
        this.productsTable.grantReadData(this.productLoadHandler);
        this.productsTable.grantWriteData(this.productsAdministrationHandler);

        // Grant invoke
        this.productsEventsHandler.grantInvoke(this.productsAdministrationHandler);
    }

    private buildFetchProductsFunction(): LambdaNode.NodejsFunction {
        const resourceId = 'ProductsFetch';

        return new LambdaNode.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/products/fetch.ts',
          handler: 'handler',
          memorySize: 128,
          timeout: cdk.Duration.seconds(5),
          bundling: {
              minify: true,
              sourceMap: false,
          },
          logRetention: RetentionDays.THREE_DAYS,
          environment: {
            PRODUCTS_TABLE: this.productsTable.tableName
          },
          runtime: lambda.Runtime.NODEJS_16_X,
          layers: [this.productLayer],
          tracing: lambda.Tracing.ACTIVE,
          // https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Lambda-Insights-extension-versionsx86-64.html
          insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0
        });
    }

    private buildAdminProductsFunction(): LambdaNode.NodejsFunction {
        const resourceId = 'ProductsAdministration';

        return new LambdaNode.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/products/admin.ts',
          handler: 'handler',
          memorySize: 128,
          timeout: cdk.Duration.seconds(5),
          bundling: {
              minify: true,
              sourceMap: false,
          },
          logRetention: RetentionDays.THREE_DAYS,
          environment: {
            PRODUCTS_TABLE: this.productsTable.tableName,
            PRODUCTS_EVENTS_FUNC_NAME: this.productsEventsHandler.functionName
          },
          runtime: lambda.Runtime.NODEJS_16_X,
          layers: [
            this.productLayer,
            this.productEventsLayer,
            this.authUserInfoLayer
          ],
          tracing: lambda.Tracing.ACTIVE,
          // https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Lambda-Insights-extension-versionsx86-64.html
          insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0
        });
    }

    private buildProductsTable(resourceId = 'ProductsDynamoDb', tableName = 'products'): dynamodb.Table{
        return new dynamodb.Table(this, resourceId, {
            tableName,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            partitionKey: {
                name: 'id',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1
        });
    }

    private initLayers() {
        const productLayerArn = systemManager.StringParameter.valueForStringParameter(this, 'ProductLayerVersionArn');
        this.productLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'ProductLayerVersionArn', productLayerArn);

        const productEventsLayerArn = systemManager.StringParameter.valueForStringParameter(this, 'ProductEventsLayerVersionArn');
        this.productEventsLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'ProductEventsLayerVersionArn', productEventsLayerArn);

        const authUserLayerArn = systemManager.StringParameter.valueForStringParameter(this, 'AuthUserInfoLayerVersionArn');
        this.authUserInfoLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'AuthUserInfoLayerVersionArn', authUserLayerArn);
    }

    private buildProductEventsFunction() {
        const resourceId = 'ProductsEvents';

        const dlq = new sqs.Queue(this, 'ProductEventsLambdaDLQ', {
            queueName: 'product-events-lambda-dlq',
            retentionPeriod: cdk.Duration.days(2)
        });

        return new LambdaNode.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/products/events.ts',
          handler: 'handler',
          memorySize: 128,
          timeout: cdk.Duration.seconds(2),
          bundling: {
              minify: true,
              sourceMap: false,
          },
          logRetention: RetentionDays.THREE_DAYS,
          environment: {
            EVENTS_TABLE: this.props.eventsTable.tableName
          },
          runtime: lambda.Runtime.NODEJS_16_X,
          layers: [this.productEventsLayer],
          tracing: lambda.Tracing.ACTIVE,
          // https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Lambda-Insights-extension-versionsx86-64.html
          insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0,
          deadLetterQueueEnabled: true,
          deadLetterQueue: dlq,
          retryAttempts: 1
        });
    }
}

export interface ProductAppStackProps extends cdk.StackProps {
    eventsTable: dynamodb.Table
}
