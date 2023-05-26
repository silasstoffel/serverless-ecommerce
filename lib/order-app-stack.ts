import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as LambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as systemManager from 'aws-cdk-lib/aws-ssm';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sub from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSource from 'aws-cdk-lib/aws-lambda-event-sources';
import * as events from 'aws-cdk-lib/aws-events';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';

export class OrderAppStack extends cdk.Stack {
    public readonly ordersHandler: LambdaNode.NodejsFunction;
    public readonly orderEventsHandler: LambdaNode.NodejsFunction;
    public readonly paymentProcessorHandler: LambdaNode.NodejsFunction;
    public readonly orderEventsFetchHandler: LambdaNode.NodejsFunction;

    private orderEventsMailHandler: LambdaNode.NodejsFunction;

    private orderEventsQueue: sqs.Queue;

    private productLayer: lambda.ILayerVersion;
    private orderLayer: lambda.ILayerVersion;
    private orderEventLayer: lambda.ILayerVersion;
    private authLayer: lambda.ILayerVersion;
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
      this.createQueues();

      this.ordersHandler = this.buildOrdersLambda();
      this.orderEventsTopic.grantPublish(this.ordersHandler);
      this.props.auditBus.grantPutEventsTo(this.ordersHandler);

      // create lambda (orderEvents) and subscribe to events from the order topic(sns)
      this.orderEventsHandler = this.buildOrdersEventsLambda();
      this.orderEventsTopic.addSubscription(new sub.LambdaSubscription(this.orderEventsHandler));

      this.paymentProcessorHandler = this.buildPaymentProcessorLambda();

      this.orderEventsMailHandler = this.buildOrderEmailLambda();
      this.orderEventsMailHandler.addEventSource(
        new lambdaEventSource.SqsEventSource(this.orderEventsQueue, {
            batchSize: 5,
            enabled: true,
            maxBatchingWindow: cdk.Duration.seconds(90)
        })
      );

      this.orderEventsFetchHandler = this.buildOrderEventsFetchLambda();

      this.createTopicSubscription();
      this.createPermissions();
    }

    private createTopicSubscription(): void {

        const createdOrderFilterPolicy = {
            eventType: sns.SubscriptionFilter.stringFilter({
                allowlist: ['CREATED']
            })
        };

        // lambda --> sns topic
        this.orderEventsTopic.addSubscription(
            new sub.LambdaSubscription(this.paymentProcessorHandler, {
                filterPolicy: createdOrderFilterPolicy
            })
        );

        // sqs --> sns topic
        this.orderEventsTopic.addSubscription(
            new sub.SqsSubscription(this.orderEventsQueue, {
                filterPolicy: createdOrderFilterPolicy
            })
        );
    }

    private buildOrdersEventsLambda(): LambdaNode.NodejsFunction {
        const resourceId = 'OrdersEvents';

        return new LambdaNode.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/orders/order-events.ts',
          handler: 'handler',
          memorySize: 128,
          timeout: cdk.Duration.seconds(5),
          bundling: {
              minify: true,
              sourceMap: false,
          },
          logRetention: RetentionDays.THREE_DAYS,
          environment: {
            EVENTS_TABLE:  this.props.eventsTable.tableName
          },
          runtime: lambda.Runtime.NODEJS_16_X,
          layers: [this.orderEventLayer],
          tracing: lambda.Tracing.ACTIVE,
          insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0
        });
    }

    private buildPaymentProcessorLambda(): LambdaNode.NodejsFunction {
        const resourceId = 'PaymentProcessor';

        return new LambdaNode.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/orders/order-payment-processor.ts',
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
          insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0
        });
    }

    private buildOrderEmailLambda(): LambdaNode.NodejsFunction {
        const resourceId = 'OrderEmail';

        return new LambdaNode.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/orders/order-email.ts',
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
          layers: [this.orderEventLayer],
          environment: {
            EMAIL_FROM: 'silasstofel@hotmail.com',
          }
        });
    }

    private buildOrdersLambda(): LambdaNode.NodejsFunction {
        const resourceId = 'Orders';

        const handler = new LambdaNode.NodejsFunction(this, resourceId, {
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
            ORDER_EVENTS_TOPIC_ARN: this.orderEventsTopic.topicArn,
            AUDIT_BUS_NAME: this.props.auditBus.eventBusName
          },
          runtime: lambda.Runtime.NODEJS_16_X,
          layers: [
            this.productLayer,
            this.orderLayer,
            this.orderEventLayer,
            this.authLayer
          ],
          tracing: lambda.Tracing.ACTIVE,
          //insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0
        });

        // Creating monitors

        // Metrics
        const productNotFoundMetric = handler.logGroup.addMetricFilter('product-not-found', {
            metricName: 'OrderWithNonValidProduct',
            metricNamespace: 'Order',
            filterPattern: logs.FilterPattern.literal('Some product not found')
        });

        // Alarm
        const productNotFoundAlarm = productNotFoundMetric.metric()
            .with({
                statistic: 'Sum',
                period: cdk.Duration.minutes(2)
            })
            .createAlarm(this, 'ProductNotFoundWhenCreateOrder', {
                alarmName: 'Product not found when creating order',
                alarmDescription: 'Some product not found when creating order',
                evaluationPeriods: 1,
                threshold: 2,
                actionsEnabled: true,
                comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD
            });

        // Actions
        const orderAlarmsTopic = new sns.Topic(this, 'OrderAlarmsTopic', {
            displayName: 'Order alarms topic',
            topicName: 'order-alarms',
        });
        orderAlarmsTopic.addSubscription(new sub.EmailSubscription('silasstofel@gmail.com'))

        productNotFoundAlarm.addAlarmAction(new cwActions.SnsAction(orderAlarmsTopic))

        return handler;
    }

    private buildOrderEventsFetchLambda(): LambdaNode.NodejsFunction {
        const resourceId = 'OrderEventsFetch';

        const func = new LambdaNode.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/orders/order-events-fetch.ts',
          handler: 'handler',
          memorySize: 128,
          timeout: cdk.Duration.seconds(5),
          bundling: {
              minify: true,
              sourceMap: false,
          },
          logRetention: RetentionDays.THREE_DAYS,
          environment: {
            EVENTS_TABLE: this.props.eventsTable.tableName
          },
          runtime: lambda.Runtime.NODEJS_16_X,
          layers: [this.orderEventLayer],
          tracing: lambda.Tracing.ACTIVE,
          insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0
        });

        const policy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: [`${this.props.eventsTable.tableArn}/index/eventsEmailGSI`],
            actions: ['dynamodb:Query']
        });

        func.addToRolePolicy(policy);

        return func;
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

        const writeThrottleEventsMetric = this.orderTable.metric('WriteThrottleEvents', {
            period: cdk.Duration.minutes(2),
            statistic: 'SampleCount',
            unit: cw.Unit.COUNT
        })

        writeThrottleEventsMetric.createAlarm(this, 'WriteThrottleEventsOrderTable', {
            alarmName: 'write-throttle-events-order-table',
            actionsEnabled: false,
            evaluationPeriods: 1,
            threshold: 10,
            comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cw.TreatMissingData.NOT_BREACHING
        })
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
            'OrderEventsLayerVersionArn',
            systemManager.StringParameter.valueForStringParameter(this, 'OrderEventsLayerVersionArn')
        );

        this.authLayer = lambda.LayerVersion.fromLayerVersionArn(
            this,
            'AuthUserInfoLayerVersionArn',
            systemManager.StringParameter.valueForStringParameter(this, 'AuthUserInfoLayerVersionArn')
        );
    }

    private createPermissions(): void {
        this.orderTable.grantReadWriteData(this.ordersHandler);
        // Adding read permission for external table (product context).
        this.props.productTable.grantReadData(this.ordersHandler);

        // orderEvents lambda assumes only police to put items
        const policy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: [this.props.eventsTable.tableArn],
            actions: ['dynamodb:PutItem'],
            conditions: {
                ['ForAllValues:StringLike']: {
                    'dynamodb:LeadingKeys': ['#order_*']
                }
            }
        });
        this.orderEventsHandler.addToRolePolicy(policy);

        // Lambda (orderEventsMailHandler) can receive messages from the order events queue.
        this.orderEventsQueue.grantConsumeMessages(this.orderEventsMailHandler);

        const sendMailPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ses:SendEmail', 'ses:SendRawEmail'],
            resources: ['*']
        });

        this.orderEventsMailHandler.addToRolePolicy(sendMailPolicy);
    }

    private createTopics(): void {
        this.orderEventsTopic = new sns.Topic(this, 'OrderEventsTopic', {
            displayName: 'Order events topic',
            topicName: 'order-events',
        });
    }

    private createQueues(): void {
        const orderEventsDLQ = new sqs.Queue(this, 'OrderEventsDLQ', {
            queueName: 'order-events-dlq',
            retentionPeriod: cdk.Duration.days(14)
        });

        this.orderEventsQueue = new sqs.Queue(this, 'OrderEventsQueue', {
            queueName: 'order-events',
            deadLetterQueue: {
                queue: orderEventsDLQ,
                maxReceiveCount: 3
            }
        });
    }
}

export interface OrderAppStackProps extends cdk.StackProps {
    productTable: dynamodb.Table,
    eventsTable: dynamodb.Table,
    auditBus: events.EventBus
}
