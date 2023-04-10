import * as LambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudWatch from 'aws-cdk-lib/aws-logs';
import * as apiGateway from 'aws-cdk-lib/aws-apigateway';
import { StageOptions } from 'aws-cdk-lib/aws-apigateway';

export class ECommerceGatewayStack extends cdk.Stack {

    public static readonly resourceName = 'ECommerceApiGateway';

    public constructor(scope: Construct, id: string, props: ECommerceGatewayStackProps) {
      super(scope, id, props);

      const deployOptions = this.buildDeployOptionsFormApiGateway(); 

      const api = new apiGateway.RestApi(this, ECommerceGatewayStack.resourceName, {
        restApiName: ECommerceGatewayStack.resourceName,
        deployOptions,
        cloudWatchRole: true
      });
      
      this.createProductsRoutes(props, api);
      this.createOrdersRoutes(props, api); 
    }

    private createOrdersRoutes(props: ECommerceGatewayStackProps, api: apiGateway.RestApi) {
        const ordersHandler = new apiGateway.LambdaIntegration(
            props.ordersHandler
        );

        const ordersResource = api.root.addResource('orders');
        
        // GET /orders?email=option&id=optional
        ordersResource.addMethod('GET', ordersHandler);
        // POST /orders
        ordersResource.addMethod('POST', ordersHandler);

        // DELETE /orders?email=required&id=required
        const orderDeleteValidator =  new apiGateway.RequestValidator(this, 'OrderDeleteValidator', {
            restApi: api,
            requestValidatorName: 'OrderDeleteValidator',
            validateRequestParameters: true
        });
        ordersResource.addMethod('DELETE', ordersHandler, {
            requestParameters: {
                'method.request.querystring.email': true,
                'method.request.querystring.id': true,
            },
            requestValidator: orderDeleteValidator
        });
    }

    private createProductsRoutes(props: ECommerceGatewayStackProps, api: apiGateway.RestApi) {
        const loadProductsHandler = new apiGateway.LambdaIntegration(
            props.fetchProductsHandler
        );

        const adminProductsHandler = new apiGateway.LambdaIntegration(
            props.adminProductsHandler
        );

        const productsResource = api.root.addResource('products');
        const productParamIDResource = productsResource.addResource('{id}');

        // GET /products
        productsResource.addMethod('GET', loadProductsHandler);
        // GET /products/{id}
        productParamIDResource.addMethod('GET', loadProductsHandler);
        // POST /products
        productsResource.addMethod('POST', adminProductsHandler);
        // PUT /products/{id}
        productParamIDResource.addMethod('PUT', adminProductsHandler);
        // DELETE /products/{id}
        productParamIDResource.addMethod('DELETE', adminProductsHandler);
    }

    private buildDeployOptionsFormApiGateway(): StageOptions {
        const logGroup = new cloudWatch.LogGroup(this, `${ECommerceGatewayStack.resourceName}Log`);

        return {
            accessLogDestination: new apiGateway.LogGroupLogDestination(logGroup),
            accessLogFormat: apiGateway.AccessLogFormat.jsonWithStandardFields({
                httpMethod: true,
                caller: true,
                ip: true,
                protocol: true,
                requestTime: true,
                resourcePath: true,
                responseLength: true,
                status: true,
                user: true
            })
        }
    }
}

export interface ECommerceGatewayStackProps extends cdk.StackProps {
    fetchProductsHandler: LambdaNode.NodejsFunction;
    adminProductsHandler: LambdaNode.NodejsFunction;
    ordersHandler: LambdaNode.NodejsFunction;
}
