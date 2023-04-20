import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class EventAppStack extends cdk.Stack {
    public readonly eventsTable: dynamodb.Table;

    public constructor(scope: Construct, id: string, props?: cdk.StackProps) {
      super(scope, id, props);
      this.eventsTable = this.buildProductsTable();
    }

    public buildProductsTable(resourceId = 'EventsDynamoDb', tableName = 'events'): dynamodb.Table{
        const table = new dynamodb.Table(this, resourceId, {
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
            timeToLiveAttribute: 'ttl',
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1
        });

        table.addGlobalSecondaryIndex({
            indexName:  'eventsEmailGSI',
            partitionKey: {
                name: 'email',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'sk',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        return table;
    }
}
