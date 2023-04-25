import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as systemManager from 'aws-cdk-lib/aws-ssm';
import * as apiGtwV2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apiGtwV2Integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as s3Notifier from 'aws-cdk-lib/aws-s3-notifications';

export class InvoiceWSAppStack extends cdk.Stack {
    private invoiceTable: dynamodb.Table;
    private invoiceBucket: s3.Bucket;
    private invoiceConnectionManagerHandler: lambda.Function;
    private invoiceGetUrlHandler: lambda.Function;
    private invoiceImporterHandler: lambda.Function;
    private invoiceCancelImporterHandler: lambda.Function;
    private webSocketApi: apiGtwV2.WebSocketApi;
    private wsApiEndpoint: string;
    private invoiceLayer: lambda.ILayerVersion;

    public constructor(
        scope: Construct,
        id: string,
        private readonly props: InvoiceWSAppStackProps
    ) {
      super(scope, id, props);

      this.initLayers();
      this.createInvoiceTable();
      this.createBucket();
      this.createInvoiceConnectionManagerHandler();
      this.createWebSocketApi();
      this.createInvoiceGetUrlHandler();
      this.createInvoiceImporterHandler();
      this.createInvoiceCancelImporterHandler();
      this.createWebSocketRoutes();
    }

    private createInvoiceTable(): void {
        this.invoiceTable = new dynamodb.Table(this, 'InvoiceDynamoTable', {
            tableName: 'invoices',
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1,
            partitionKey: {
                name: 'pk',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'sk',
                type: dynamodb.AttributeType.STRING
            },
            timeToLiveAttribute: 'ttl'
        });
    }

    private createBucket(): void {
        this.invoiceBucket = new s3.Bucket(this, 'InvoiceBucket', {
            // bucketName: 'invoices',
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [
                {
                    enabled: true,
                    expiration: cdk.Duration.days(1)
                }
            ]
        });
    }

    private createInvoiceConnectionManagerHandler(): void {
        const resourceId = 'InvoiceConnectionManager';

        this.invoiceConnectionManagerHandler = new lambdaNode.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/invoices/connection-manager.ts',
          handler: 'handler',
          memorySize: 128,
          timeout: cdk.Duration.seconds(5),
          bundling: {
              minify: true,
              sourceMap: false,
          },
          logRetention: RetentionDays.ONE_DAY,
          runtime: lambda.Runtime.NODEJS_16_X,
          tracing: lambda.Tracing.ACTIVE,
          insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0,
          layers: [this.invoiceLayer]
        });
    }

    private createWebSocketApi(): void {
        const integration = new apiGtwV2Integrations.WebSocketLambdaIntegration(
            'ConnectionManagerHandler',
            this.invoiceConnectionManagerHandler
        );

        this.webSocketApi = new apiGtwV2.WebSocketApi(this, 'InvoiceWebSocketApi', {
            apiName: 'InvoiceWebSocketAPI',
            description: 'Invoice WebSocket API',
            connectRouteOptions: { integration },
            disconnectRouteOptions: {
                integration,
                returnResponse: true
            },
        });

        const stageName = 'prod';
        this.wsApiEndpoint = `${this.webSocketApi.apiEndpoint}/${stageName}`;

        new apiGtwV2.WebSocketStage(this, 'InvoiceWebSocketApiStage', {
            webSocketApi: this.webSocketApi,
            stageName,
            autoDeploy: true,
        });
    }

    private createInvoiceGetUrlHandler(): void {
        const resourceId = 'InvoiceGetUrl';

        this.invoiceGetUrlHandler = new lambdaNode.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/invoices/get-upload-url.ts',
          handler: 'handler',
          memorySize: 128,
          timeout: cdk.Duration.seconds(5),
          bundling: {
              minify: true,
              sourceMap: false,
          },
          logRetention: RetentionDays.ONE_DAY,
          runtime: lambda.Runtime.NODEJS_16_X,
          tracing: lambda.Tracing.ACTIVE,
          insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0,
          environment: {
            INVOICE_TABLE_NAME: this.invoiceTable.tableName,
            INVOICE_BUCKET_NAME: this.invoiceBucket.bucketName,
            INVOICE_WS_API_ENDPOINT: this.wsApiEndpoint,
          },
          layers: [this.invoiceLayer]
        });

        const dynamoPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: [this.invoiceTable.tableArn],
            actions: ['dynamodb:PutItem'],
            conditions: {
               ['ForAllValues:StringLike']: {
                  'dynamodb:LeadingKeys': ['#transaction']
               }
            }
         })

        const s3Policy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: [`${this.invoiceBucket.bucketArn}/*`],
            actions: ['s3:PutObject']
        });

        this.invoiceGetUrlHandler.addToRolePolicy(dynamoPolicy);
        this.invoiceGetUrlHandler.addToRolePolicy(s3Policy);
        this.webSocketApi.grantManageConnections(this.invoiceGetUrlHandler);
    }

    private createInvoiceImporterHandler(): void {
        const resourceId = 'InvoiceImporter';

        this.invoiceImporterHandler = new lambdaNode.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/invoices/importer.ts',
          handler: 'handler',
          memorySize: 128,
          timeout: cdk.Duration.seconds(5),
          bundling: {
              minify: true,
              sourceMap: false,
          },
          logRetention: RetentionDays.ONE_DAY,
          runtime: lambda.Runtime.NODEJS_16_X,
          tracing: lambda.Tracing.ACTIVE,
          insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0,
          environment: {
            INVOICE_TABLE_NAME: this.invoiceTable.tableName,
            INVOICE_WS_API_ENDPOINT: this.wsApiEndpoint,
          },
          layers: [this.invoiceLayer]
        });

        const s3Policy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: [`${this.invoiceBucket.bucketArn}/*`],
            actions: ['s3:DeleteObject', 's3:GetObject']
        });

        this.invoiceImporterHandler.addToRolePolicy(s3Policy);
        this.invoiceTable.grantReadWriteData(this.invoiceImporterHandler);
        this.invoiceBucket.addEventNotification(
            s3.EventType.OBJECT_CREATED_PUT,
            new s3Notifier.LambdaDestination(this.invoiceImporterHandler)
        );
        this.webSocketApi.grantManageConnections(this.invoiceImporterHandler);
    }

    private createInvoiceCancelImporterHandler(): void {
        const resourceId = 'InvoiceCancelImporter';

        this.invoiceCancelImporterHandler = new lambdaNode.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/invoices/cancel-importer.ts',
          handler: 'handler',
          memorySize: 128,
          timeout: cdk.Duration.seconds(5),
          bundling: {
              minify: true,
              sourceMap: false,
          },
          logRetention: RetentionDays.ONE_DAY,
          runtime: lambda.Runtime.NODEJS_16_X,
          tracing: lambda.Tracing.ACTIVE,
          insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0,
          environment: {
            INVOICE_TABLE_NAME: this.invoiceTable.tableName,
            INVOICE_WS_API_ENDPOINT: this.wsApiEndpoint,
          },
          layers: [this.invoiceLayer]
        });

        const dynamoPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: [this.invoiceTable.tableArn],
            actions: ['dynamodb:UpdateItem', 'dynamodb:GetItem'],
            conditions: {
                ['ForAllValues:StringLike']: {
                    'dynamodb:LeadingKeys': ['#transaction']
                }
            }
        });

        this.invoiceCancelImporterHandler.addToRolePolicy(dynamoPolicy);
        this.webSocketApi.grantManageConnections(this.invoiceCancelImporterHandler);
    }

    private createWebSocketRoutes() {
        const getImportUrlIntegration = new apiGtwV2Integrations.WebSocketLambdaIntegration(
            "InvoiceGetUrlHandler",
            this.invoiceGetUrlHandler
        );

        const cancelImportIntegration = new apiGtwV2Integrations.WebSocketLambdaIntegration(
            "InvoiceCancelImportHandler",
            this.invoiceCancelImporterHandler
        );

        this.webSocketApi.addRoute('get-import-url', {
            integration: getImportUrlIntegration
        });

        this.webSocketApi.addRoute('cancel-import', {
            integration: cancelImportIntegration
        });
    }

    private initLayers() {
        this.invoiceLayer = lambda.LayerVersion.fromLayerVersionArn(
            this,
            'InvoiceLayerVersion',
            systemManager.StringParameter.valueForStringParameter(this, 'InvoiceLayerVersionArn')
        );
    }
}

export interface InvoiceWSAppStackProps extends cdk.StackProps {}