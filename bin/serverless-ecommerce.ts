#!/usr/bin/env node
import * as dotenv from 'dotenv';
dotenv.config();

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductAppStack } from '../lib/product-app-stack';
import { ECommerceGatewayStack } from '../lib/ecommerce-gateway-stack';
import { ProductLayerStack } from '../lib/product-layer-stack';
import { EventAppStack } from '../lib/event-app-stack';
import { OrderAppStack } from '../lib/order-app-stack';
import { OrderLayerStack } from '../lib/order-layer-stack';
import { AuthLayerStack } from '../lib/auth-layer-stack';
import { InvoiceWSAppStack } from '../lib/invoice-ws-app-stack';
import { InvoiceLayerStack } from '../lib/invoice-layer-stack';
import { AuditEventBusStack } from '../lib/audit-event-bus';

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

const auditEventBusStack = new AuditEventBusStack(app, 'AuditEventBusStack', props);
const auditBus = auditEventBusStack.bus;

const productLayerStack = new ProductLayerStack(app, 'ProductsLayerApp', props);
const authUserInfoLayerStack = new AuthLayerStack(app, 'AuthUserInfoLayerStack', props);

const eventAppStack = new EventAppStack(app, 'EventAppStack', props);
const eventsTable = eventAppStack.eventsTable;

const productAppStack = new ProductAppStack(app, 'ProductsApp', {...props, eventsTable });
productAppStack.addDependency(productLayerStack);
productAppStack.addDependency(eventAppStack);
productAppStack.addDependency(authUserInfoLayerStack);

const orderLayerStack = new OrderLayerStack(app, 'OrdersLayerApp', props);
const orderAppStack = new OrderAppStack(app, 'OrderAppStack', {
    ...props,
    productTable: productAppStack.productsTable,
    eventsTable,
    auditBus
});
orderAppStack.addDependency(productAppStack);
orderAppStack.addDependency(orderLayerStack);
orderAppStack.addDependency(eventAppStack);
orderAppStack.addDependency(auditEventBusStack);

const eCommerceApiGateway = new ECommerceGatewayStack(
    app,
    ECommerceGatewayStack.resourceName,
    {
        ...props,
        fetchProductsHandler: productAppStack.productLoadHandler,
        adminProductsHandler: productAppStack.productsAdministrationHandler,
        ordersHandler: orderAppStack.ordersHandler,
        ordersEventsFetchHandler: orderAppStack.orderEventsFetchHandler
    }
);

eCommerceApiGateway.addDependency(productAppStack);
eCommerceApiGateway.addDependency(orderAppStack);

const invoiceLayerStack = new InvoiceLayerStack(app, 'InvoiceLayerStack', props);

const invoiceWSAppStack = new InvoiceWSAppStack(app, 'InvoiceWSAppStack', {...props, eventsTable, auditBus });
invoiceWSAppStack.addDependency(invoiceLayerStack);
invoiceLayerStack.addDependency(eventAppStack);
invoiceLayerStack.addDependency(auditEventBusStack);
