import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

export class AuditEventBusStack extends cdk.Stack {

    readonly bus: events.EventBus
    private orderErrorHandler: lambdaNodeJS.NodejsFunction;
    private invoiceErrorHandler: lambdaNodeJS.NodejsFunction;
    private queueTimeout: sqs.Queue;

    public constructor(
        scope: Construct,
        id: string,
        props?: cdk.StackProps
    ) {
      super(scope, id, props);

      this.buildOrderErrorHandler();
      this.buildInvoiceErrorHandler();

      this.createQueues();

      this.bus = this.createEventBus();
      this.createRules();
    }

    private createQueues() {
        this.queueTimeout = new sqs.Queue(this, 'InvoiceImportTimeout', {
            queueName: 'invoice-import-timeout',
        });
    }

    private createEventBus(): events.EventBus {
        const bus = new events.EventBus(this, 'AuditEventBus', {
            eventBusName: 'AuditEventBus',
        })

        bus.archive('BusArchive', {
          eventPattern: {
              source: ['app.order']
          },
          archiveName: 'auditEvents',
          retention: cdk.Duration.days(10)
        })

        return bus;
    }

    private createRules() {
        const nonValidOrderRule = new events.Rule(this, 'NonValidOrderRule', {
            ruleName: 'NonValidOrderRule',
            description: 'Rule matching non valid order',
            eventBus: this.bus,
            eventPattern: {
                source: ['app.order'],
                detailType: ['order'],
                detail: {
                    reason: ['PRODUCT_NOT_FOUND']
                }
            }
        });

        nonValidOrderRule.addTarget(
            new targets.LambdaFunction(this.orderErrorHandler)
        );

        const nonValidInvoiceRule = new events.Rule(this, 'NonValidInvoiceRule', {
            ruleName: 'NonValidInvoiceRule',
            description: 'Rule matching non valid invoice',
            eventBus: this.bus,
            eventPattern: {
                source: ['app.invoice'],
                detailType: ['invoice'],
                detail: {
                    errorDetail: ['FAIL_NO_INVOICE_NUMBER']
                }
            }
        });

        nonValidInvoiceRule.addTarget(
            new targets.LambdaFunction(this.invoiceErrorHandler)
        );

        const timeoutImportInvoiceRule = new events.Rule(this, 'TimeoutImportInvoiceRule', {
            ruleName: 'TimeoutImportInvoiceRule',
            description: 'Rule matching timeout import invoice',
            eventBus: this.bus,
            eventPattern: {
                source: ['app.invoice'],
                detailType: ['invoice'],
                detail: {
                    errorDetail: ['TIMEOUT']
                }
            }
        });

        timeoutImportInvoiceRule.addTarget(
            new targets.SqsQueue(this.queueTimeout)
        );
    }

    private buildOrderErrorHandler() {
        const resourceId = 'OrderError';

        this.orderErrorHandler = new lambdaNodeJS.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/audit/invoice-error.ts',
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

    private buildInvoiceErrorHandler() {
        const resourceId = 'InvoiceError';

        this.invoiceErrorHandler = new lambdaNodeJS.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/audit/order-error.ts',
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
}
