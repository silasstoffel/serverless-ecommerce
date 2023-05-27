import * as LambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudWatch from 'aws-cdk-lib/aws-logs';
import * as apiGateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from "aws-cdk-lib/aws-iam";
import { StageOptions } from 'aws-cdk-lib/aws-apigateway';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

export class ECommerceGatewayStack extends cdk.Stack {

    public static readonly resourceName = 'ECommerceApiGateway';
    private  productAuthorizer: apiGateway.CognitoUserPoolsAuthorizer;
    private  adminAuthorizer: apiGateway.CognitoUserPoolsAuthorizer;
    private  orderAuthorizer: apiGateway.CognitoUserPoolsAuthorizer;
    private  customerPool: cognito.UserPool;
    private  adminPool: cognito.UserPool;

    public constructor(scope: Construct, id: string, private readonly props: ECommerceGatewayStackProps) {
      super(scope, id, props);

      const deployOptions = this.buildDeployOptionsFormApiGateway();

      const api = new apiGateway.RestApi(this, ECommerceGatewayStack.resourceName, {
        restApiName: ECommerceGatewayStack.resourceName,
        deployOptions,
        cloudWatchRole: true
      });

      // Cognito
      this.createCustomerUserPool();
      this.createAdminUserPool();
      this.createAuthorizer();

      // Routes
      this.createProductsRoutes(api);
      this.createOrdersRoutes(api);

      // Policies
      this.createPolicy();
    }

    private createOrdersRoutes(api: apiGateway.RestApi) {
        const ordersHandler = new apiGateway.LambdaIntegration(
            this.props.ordersHandler
        );

        const fullAuthorizer = {
            authorizer: this.orderAuthorizer,
            authorizationType: apiGateway.AuthorizationType.COGNITO,
            authorizationScopes: ['customer/web', 'customer/mobile', 'admin/web']
        };

        const webAuthorizer = {
            authorizer: this.orderAuthorizer,
            authorizationType: apiGateway.AuthorizationType.COGNITO,
            authorizationScopes: ['customer/web', 'admin/web']
        };

        const ordersResource = api.root.addResource('orders');

        // GET /orders?email=option&id=optional
        ordersResource.addMethod('GET', ordersHandler, fullAuthorizer);

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
            },
            ...webAuthorizer
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
                requestValidator: orderEventsValidator,
                ...webAuthorizer
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

        const loadProductsAuthorizer = {
            authorizer: this.productAuthorizer,
            authorizationType: apiGateway.AuthorizationType.COGNITO,
            authorizationScopes: ['customer/web', 'customer/mobile', 'admin/web']
        };

        const loadProductsWebAuthorizer = {
            authorizer: this.productAuthorizer,
            authorizationType: apiGateway.AuthorizationType.COGNITO,
            authorizationScopes: ['customer/web', 'admin/web']
        };

        const productsResource = api.root.addResource('products');
        const productParamIDResource = productsResource.addResource('{id}');

        // GET /products
        productsResource.addMethod('GET', loadProductsHandler, loadProductsAuthorizer);
        // GET /products/{id}
        productParamIDResource.addMethod('GET', loadProductsHandler, loadProductsWebAuthorizer);

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
            },
            authorizer: this.adminAuthorizer,
            authorizationType: apiGateway.AuthorizationType.COGNITO,
            authorizationScopes: ['admin/web']
        };

        // POST /products
        productsResource.addMethod('POST', adminProductsHandler, upsertConfig);
        // PUT /products/{id}
        productParamIDResource.addMethod('PUT', adminProductsHandler, upsertConfig);
        // DELETE /products/{id}
        productParamIDResource.addMethod('DELETE', adminProductsHandler, {
            authorizer: this.adminAuthorizer,
            authorizationType: apiGateway.AuthorizationType.COGNITO,
            authorizationScopes: ['admin/web']
        });
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

    private createPostConfirmationHandler(): LambdaNode.NodejsFunction {
        const resourceId = 'PostConfirmation';

        return new LambdaNode.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/auth/post-confirmation.ts',
          handler: 'handler',
          memorySize: 128,
          timeout: cdk.Duration.seconds(10),
          bundling: { minify: true, sourceMap: false },
          logRetention: RetentionDays.ONE_DAY,
          runtime: lambda.Runtime.NODEJS_16_X,
          tracing: lambda.Tracing.ACTIVE,
          insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0,
        });
    }

    private createPreAuthenticateHandler(): LambdaNode.NodejsFunction {
        const resourceId = 'PreAuthentication';

        return new LambdaNode.NodejsFunction(this, resourceId, {
          functionName: resourceId,
          entry: './src/applications/auth/pre-authentication.ts',
          handler: 'handler',
          memorySize: 128,
          timeout: cdk.Duration.seconds(10),
          bundling: { minify: true, sourceMap: false },
          logRetention: RetentionDays.ONE_DAY,
          runtime: lambda.Runtime.NODEJS_16_X,
          tracing: lambda.Tracing.ACTIVE,
          insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0,
        });
    }

    private createCustomerUserPool() {
        const preAuthentication = this.createPreAuthenticateHandler();
        const postConfirmation = this.createPostConfirmationHandler();

        this.customerPool = new cognito.UserPool(this, "CognitoCustomerPool", {
            userPoolName: 'customer-pool',
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            selfSignUpEnabled: true,
            autoVerify: {
                email: true,
                phone: false,
            },
            userVerification: {
                emailSubject: 'Verify your email address for e-commerce service',
                emailBody: 'Thank you for signing up to e-commerce. Your verification code is {####}',
                emailStyle: cognito.VerificationEmailStyle.CODE
            },
            signInAliases: {
                username: false,
                email: true,
            },
            standardAttributes: {
                fullname: {
                    required: true,
                    mutable: false
                }
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: true,
                tempPasswordValidity: cdk.Duration.days(1)
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            lambdaTriggers: {
                preAuthentication,
                postConfirmation
            }
        });

        this.customerPool.addDomain('customer-domain', {
            cognitoDomain: {
                domainPrefix: 'serverless-e-commerce-customer-service'
            }
        })

        const customerWebScope = new cognito.ResourceServerScope({
            scopeName: 'web',
            scopeDescription: 'Customers web operations'
        });

        const customerMobileScope = new cognito.ResourceServerScope({
            scopeName: 'mobile',
            scopeDescription: 'Customers mobile operations'
        });

        const customerResourceService = this.customerPool.addResourceServer('CustomerResourceService', {
            identifier: 'customer',
            userPoolResourceServerName: 'customer-resource-server',
            scopes: [customerMobileScope, customerWebScope]
        });

        this.customerPool.addClient('customer-web-client', {
            userPoolClientName: 'customer-web-client',
            authFlows: { userPassword: true },
            accessTokenValidity: cdk.Duration.minutes(60),
            refreshTokenValidity: cdk.Duration.days(7),
            oAuth: {
                scopes: [
                    cognito.OAuthScope.resourceServer(customerResourceService, customerWebScope)
                ]
            }
        });

        this.customerPool.addClient('customer-mobile-client', {
            userPoolClientName: 'customer-mobile-client',
            authFlows: { userPassword: true },
            accessTokenValidity: cdk.Duration.minutes(60),
            refreshTokenValidity: cdk.Duration.days(7),
            oAuth: {
                scopes: [
                    cognito.OAuthScope.resourceServer(customerResourceService, customerMobileScope)
                ]
            }
        });

        //this.productAuthorizer = new apiGateway.CognitoUserPoolsAuthorizer(this, 'CognitoProductsAuthorizer', {
        //    authorizerName: 'products-authorizer',
        //    cognitoUserPools: [this.customerPool]
        //});
    }

    private createAdminUserPool() {
        this.adminPool = new cognito.UserPool(this, "CognitoAdminPool", {
            userPoolName: 'admin-pool',
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            selfSignUpEnabled: false,
            userInvitation: {
                emailSubject: 'Welcome do serverless e-commerce administration service.',
                emailBody: 'Your username is {username} and your temporary password is {####}'
            },
            signInAliases: {
                username: false,
                email: true,
            },
            standardAttributes: {
                email: {
                    required: true,
                    mutable: false
                }
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: true,
                tempPasswordValidity: cdk.Duration.days(1)
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY
        });

        this.adminPool.addDomain('admin-domain', {
            cognitoDomain: {
                domainPrefix: 'serverless-e-commerce-admin-service'
            }
        })

        const adminWebScope = new cognito.ResourceServerScope({
            scopeName: 'web',
            scopeDescription: 'Admin web'
        });

        const adminResourceService = this.adminPool.addResourceServer('AdminResourceService', {
            identifier: 'admin',
            userPoolResourceServerName: 'admin-resource-server',
            scopes: [adminWebScope]
        });

        this.adminPool.addClient('admin-web-client', {
            userPoolClientName: 'admin-web-client',
            authFlows: { userPassword: true },
            accessTokenValidity: cdk.Duration.minutes(60),
            refreshTokenValidity: cdk.Duration.days(7),
            oAuth: {
                scopes: [
                    cognito.OAuthScope.resourceServer(adminResourceService, adminWebScope)
                ]
            }
        });
    }

    private createAuthorizer() {
        this.productAuthorizer = new apiGateway.CognitoUserPoolsAuthorizer(this, 'CognitoProductsAuthorizer', {
            authorizerName: 'products-authorizer',
            cognitoUserPools: [this.customerPool, this.adminPool]
        });

        this.adminAuthorizer = new apiGateway.CognitoUserPoolsAuthorizer(this, 'CognitoAdminAuthorizer', {
            authorizerName: 'admin-authorizer',
            cognitoUserPools: [this.adminPool]
        });

        this.orderAuthorizer = new apiGateway.CognitoUserPoolsAuthorizer(this, 'CognitoOrderAuthorizer', {
            authorizerName: 'order-authorizer',
            cognitoUserPools: [this.adminPool, this.customerPool]
        });
    }

    private createPolicy() {
        const adminUserPolicy = new iam.Policy(this, "AdminGetUserPolicy", {
            statements: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions:["cognito-idp:AdminGetUser"],
                    resources: [this.adminPool.userPoolArn]
                })
            ]
        })
        adminUserPolicy.attachToRole(<iam.Role> this.props.adminProductsHandler.role)

        const customerUserPolicy = new iam.Policy(this, "CustomerGetUserPolicy", {
            statements: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions:["cognito-idp:AdminGetUser"],
                    resources: [this.customerPool.userPoolArn]
                })
            ]
        })
        customerUserPolicy.attachToRole(<iam.Role> this.props.ordersHandler.role)
    }
}

export interface ECommerceGatewayStackProps extends cdk.StackProps {
    fetchProductsHandler: LambdaNode.NodejsFunction;
    adminProductsHandler: LambdaNode.NodejsFunction;
    ordersHandler: LambdaNode.NodejsFunction;
    ordersEventsFetchHandler: LambdaNode.NodejsFunction;
}
