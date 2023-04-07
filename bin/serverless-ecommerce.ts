#!/usr/bin/env node
import * as dotenv from 'dotenv';
dotenv.config();

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductAppStack } from '../lib/product-app-stack';
import { ECommerceGatewayStack } from '../lib/ecommerce-gateway-stack';
import { ProductLayerStack } from '../lib/product-layer-stack';
import { EventAppStack } from '../lib/event-app-stack';

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

const props = { tags, env };

const app = new cdk.App();

const productLayerStack = new ProductLayerStack(app, 'ProductsLayerApp', props);

const eventAppStack = new EventAppStack(app, 'EventAppStack', props);

const productAppStack = new ProductAppStack(app, 'ProductsApp', {
    ...props,
    eventsTable: eventAppStack.eventsTable
});
productAppStack.addDependency(productLayerStack);
productAppStack.addDependency(eventAppStack);

const eCommerceApiGateway = new ECommerceGatewayStack(
    app,
    ECommerceGatewayStack.resourceName,
    {
        ...props,
        fetchProductsHandler: productAppStack.productLoadHandler,
        adminProductsHandler: productAppStack.productsAdministrationHandler
    }
);

eCommerceApiGateway.addDependency(productAppStack);
