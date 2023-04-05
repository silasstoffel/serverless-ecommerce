#!/usr/bin/env node
import * as dotenv from 'dotenv';
dotenv.config();

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductAppStack } from '../lib/product-app-stack';
import { ECommerceGatewayStack } from '../lib/ecommerce-gateway-stack';

const env: cdk.Environment = {
    account: process.env.AWS_ACCOUNT_ID,
    region: process.env.AWS_REGION
};

const tags = {
    owner: 'squad-checkout',
    stack: 'javascript',
    app: 'serverless-e-commerce',
    iac: 'cdk',
    env: 'production'
};

const app = new cdk.App();

const productAppStack = new ProductAppStack(app, 'ProductsApp', { tags, env });

const eCommerceApiGateway = new ECommerceGatewayStack(
    app,
    ECommerceGatewayStack.resourceName,
    {
        tags,
        env,
        fetchProductsHandler: productAppStack.productLoadHandler,
        adminProductsHandler: productAppStack.productsAdministrationHandler
    }
);

eCommerceApiGateway.addDependency(productAppStack);
