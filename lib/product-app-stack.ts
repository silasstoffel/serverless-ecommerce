import * as Lambda from 'aws-cdk-lib/aws-lambda';
import * as LambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class ProductAppStack extends cdk.Stack {
    public readonly productLoadHandler: LambdaNode.NodejsFunction;
    public readonly productsAdministrationHandler: LambdaNode.NodejsFunction;
    public readonly productsTable: dynamodb.Table;

    public constructor(scope: Construct, id: string, props?: cdk.StackProps) {
      super(scope, id, props);
      
      this.productsTable = this.buildProductsTable();
      this.productLoadHandler = this.buildFetchProductsFunction();
      this.productsAdministrationHandler = this.buildAdminProductsFunction();

      // IAM read/write data from products table
      this.productsTable.grantReadData(this.productLoadHandler);
      this.productsTable.grantWriteData(this.productsAdministrationHandler);
    }

    public buildFetchProductsFunction(): LambdaNode.NodejsFunction {
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
          }
        });
    }

    public buildAdminProductsFunction(): LambdaNode.NodejsFunction {
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
            PRODUCTS_TABLE: this.productsTable.tableName
          }
        });
    }


    public buildProductsTable(resourceId = 'ProductsDynamoDb', tableName = 'products'): dynamodb.Table{
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
}
