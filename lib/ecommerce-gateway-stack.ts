import * as LambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudWatch from 'aws-cdk-lib/aws-logs';
import * as apiGateway from 'aws-cdk-lib/aws-apigateway';
import { StageOptions } from 'aws-cdk-lib/aws-apigateway';

export class ECommerceGatewayStack extends cdk.Stack {

    public static readonly resourceName = 'ECommerceApiGateway';

    public constructor(scope: Construct, id: string, private readonly props: ECommerceGatewayStackProps) {
      super(scope, id, props);

      const deployOptions = this.buildDeployOptionsFormApiGateway();

      const api = new apiGateway.RestApi(this, ECommerceGatewayStack.resourceName, {
        restApiName: ECommerceGatewayStack.resourceName,
        deployOptions,
        cloudWatchRole: true
      });

      this.createProductsRoutes(api);
      this.createOrdersRoutes(api);
    }

    private createOrdersRoutes(api: apiGateway.RestApi) {
        const ordersHandler = new apiGateway.LambdaIntegration(
            this.props.ordersHandler
        );

        const ordersResource = api.root.addResource('orders');

        // GET /orders?email=option&id=optional
        ordersResource.addMethod('GET', ordersHandler);

        // POST /orders
        const orderCreateValidator =  new apiGateway.RequestValidator(this, 'OrderCreateValidator', {
            restApi: api,
            requestValidatorName: 'OrderCreateValidator',
            validateRequestBody: true
        });

        const attributeType = apiGateway.JsonSchemaType;
        const orderModelValidator = new apiGateway.Model(this, "OrderCreateSchema", {
            modelName: 'OrderCreateSchema',
            restApi: api,
            schema: {
                type: attributeType.OBJECT,
                properties: {
                    email: {
                        type: attributeType.STRING,
                    },
                    productIds: {
                        type: attributeType.ARRAY,
                        minItems: 1,
                        items: { type: attributeType.STRING}
                    },
                    payment: { type: attributeType.STRING, enum: ['CASH', 'DEBIT_CARD', 'CREDIT_CARD'] },
                },
                required: [
                    'email',
                    'productIds',
                    'payment'
                ]
            }
        });

        ordersResource.addMethod('POST', ordersHandler, {
            requestValidator: orderCreateValidator,
            requestModels: {
                'application/json': orderModelValidator
            }
        });

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

        // GET /orders/events?email=required&eventType=optional
        const orderEventsResource = ordersResource.addResource('events');
        const orderEventsValidator =  new apiGateway.RequestValidator(this, 'OrderEventsFetchValidator', {
            restApi: api,
            requestValidatorName: 'OrderEventsFetchValidator',
            validateRequestParameters: true
        });


        orderEventsResource.addMethod(
            'GET',
            new apiGateway.LambdaIntegration(this.props.ordersEventsFetchHandler),
            {
                requestParameters: {
                   'method.request.querystring.email': true,
                   'method.request.querystring.eventType': false,
                },
                requestValidator: orderEventsValidator
            }
        );

    }

    private createProductsRoutes(api: apiGateway.RestApi) {
        const loadProductsHandler = new apiGateway.LambdaIntegration(
            this.props.fetchProductsHandler
        );

        const adminProductsHandler = new apiGateway.LambdaIntegration(
            this.props.adminProductsHandler
        );

        const productsResource = api.root.addResource('products');
        const productParamIDResource = productsResource.addResource('{id}');

        // GET /products
        productsResource.addMethod('GET', loadProductsHandler);
        // GET /products/{id}
        productParamIDResource.addMethod('GET', loadProductsHandler);

        const upsertProductValidator = new apiGateway.RequestValidator(this, 'UpSertProductValidator', {
            restApi: api,
            requestValidatorName: 'UpSertProductValidator',
            validateRequestBody: true
        });

        const attrType = apiGateway.JsonSchemaType;
        const productModel = new apiGateway.Model(this, 'ProductModel', {
            restApi: api,
            modelName: 'ProductModel',
            description: 'Schema to create and update product',
            schema: {
                type: attrType.OBJECT,
                properties: {
                    productName: {
                        type: attrType.STRING,
                        minLength: 2,
                    },
                    code: {
                        type: attrType.STRING,
                        minLength: 2,
                    },
                    price: {
                        type: attrType.NUMBER,
                    },
                    model: {
                        type: attrType.STRING,
                    }
                },
                required: ['productName', 'code', 'price']
            }
        });

        const upsertConfig = {
            requestValidator: upsertProductValidator,
            requestModels: {
                'application/json': productModel,
            }
        };

        // POST /products
        productsResource.addMethod('POST', adminProductsHandler, upsertConfig);
        // PUT /products/{id}
        productParamIDResource.addMethod('PUT', adminProductsHandler, upsertConfig);
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
    ordersEventsFetchHandler: LambdaNode.NodejsFunction;
}
