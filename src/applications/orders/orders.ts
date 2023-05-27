import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDB, SNS, EventBridge, CognitoIdentityServiceProvider } from 'aws-sdk';
import * as AwsXRay from 'aws-xray-sdk';
import { v4 as uuid } from 'uuid';
import { Product, ProductRepository } from '/opt/nodejs/products-layer';
import { OrderRepository, Order } from '/opt/nodejs/orders-layer';
import { OrderEvent, OrderEventSchema, OrderEventType } from '/opt/nodejs/orders-events-layer';
import { jsonResponse } from 'src/shared/response';
import { OrderRequest, OrderResponse, OrderProductResponse } from './types/order.types';
import { AuthInfoService } from '/opt/nodejs/auth-user-info';


AwsXRay.captureAWS(require('aws-sdk'));

const productsTable = process.env.PRODUCTS_TABLE!;
const ordersTable = process.env.ORDERS_TABLE!;
const orderEventsTopicARN = process.env.ORDER_EVENTS_TOPIC_ARN!
const auditBusName = process.env.AUDIT_BUS_NAME!;

const dynamoDb = new DynamoDB.DocumentClient();
const SNSClient = new SNS();
const eventBridgeClient = new EventBridge();
const cognitoIdentityServiceProvider = new CognitoIdentityServiceProvider();

const productRepository = new ProductRepository(dynamoDb, productsTable);
const orderRepository = new OrderRepository(dynamoDb, ordersTable);
const authInfoService = new AuthInfoService(cognitoIdentityServiceProvider);

export async function handler(
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyResult> {
    const method = event.httpMethod;
    const lambdaRequestId = context.awsRequestId;
    const apiGatewayRequestId = event.requestContext.requestId;
    const contextId = event.requestContext;
    const resource = event.resource;
    const queryStringParams = event.queryStringParameters;

    console.log(JSON.stringify({
        method,
        resource,
        contextId,
        lambdaRequestId,
        apiGatewayRequestId,
        payload: event?.body,
        queryStringParams
    }, null, 2));

    if (method === 'GET') {

        if (queryStringParams) {
            const { email, id } = queryStringParams;
            const emailAuth = await authInfoService.getUserInfo(event.requestContext.authorizer);
            const isAdmin = authInfoService.isAdmin(event.requestContext.authorizer);

            if (email && id) {
                if (!isAdmin && emailAuth !== email) {
                    return jsonResponse(403, { code: 'OPERATION_NOT_PERMITTED', message: 'Operation not permitted.'});
                }

                const order = await orderRepository.find(id, email);
                if (!order) {
                    return jsonResponse(404, { code: 'ORDER_NOT_FOUND', message: 'Order not found.'});
                }

                return jsonResponse(200, convertOrderToResponse(order));
            }

            if (email && !id) {
                if (!isAdmin && emailAuth !== email) {
                    return jsonResponse(403, { code: 'OPERATION_NOT_PERMITTED', message: 'Operation not permitted.'});
                }
                // Get all orders from an user
                const orders = await orderRepository.findByEmail(email);
                const response = orders.map((item) => convertOrderToResponse(item));
                return jsonResponse(200, response);
            }
        }

        if (!authInfoService.isAdmin(event.requestContext.authorizer)) {
            return jsonResponse(403, { code: 'OPERATION_NOT_PERMITTED', message: 'Operation not permitted.'});
        }

        const orders = await orderRepository.findAll(OrderRepository.viewWithoutProduct);
        const response = orders.map((item) => convertOrderToResponse(item));
        return jsonResponse(200, response);
    }

    if (method === 'POST') {
        console.log('Creating order.');
        const orderRequest = JSON.parse(event.body!) as OrderRequest;
        const products = await productRepository.findByIds(orderRequest.productIds);

        if (products.length !== orderRequest.productIds.length) {
            const put = await eventBridgeClient.putEvents({
                Entries: [{
                    Source: 'app.order',
                    EventBusName: auditBusName,
                    DetailType: 'order',
                    Time: new Date(),
                    Detail: JSON.stringify({
                        reason: 'PRODUCT_NOT_FOUND',
                        orderRequest
                    })
                }]
            }).promise()

            console.log('Put event result', put);
            const message = 'Some product not found.'
            console.error(message);

            return jsonResponse(404, { code: 'SOME_PRODUCT_NOT_FOUND', message } );
        }

        const order = buildOrder(orderRequest, products);
        const createPromise = orderRepository.create(order);
        const publishPromise = produceEvent(order, OrderEventType.CREATED, lambdaRequestId);

        const results = await Promise.all([createPromise, publishPromise]);

        console.log(`Message publish:${results[1].MessageId} - OrderId:${order.sk}`);
        console.log('Order was created.');
        return jsonResponse(201, convertOrderToResponse(order));
    }

    if (method === 'DELETE') {
        console.log('Deleting order.');
        const { email, id } = queryStringParams!;

        try {
            const data = await orderRepository.delete(String(id), String(email));
            console.log('Order deleted.');
            const publishResult = await produceEvent(data, OrderEventType.DELETED, lambdaRequestId);
            console.log(`Message publish:${publishResult.MessageId} - OrderId:${data.sk}`);
            return jsonResponse(200, convertOrderToResponse(data));
        } catch(err) {
            return jsonResponse(404, { code: 'NOT_FOUND', message: 'Some product not found.'});
        }
    }

    return jsonResponse(422, {
        code: 'INVALID_RESOURCE',
        message: 'Invalid resource requested'
    });
}

function buildOrder(payload: OrderRequest, products: Product[]): Order {
    const orderProducts: OrderProductResponse[] = [];
    let totalOrder = 0;

    products.forEach(product => {
        totalOrder += product.price;
        const { code, price } = product;
        orderProducts.push({ code, price });
    });

    return {
        pk: payload.email,
        sk: uuid(),
        createdAt: Date.now(),
        billing: {
            payment: payload.payment,
            totalOrder
        },
        shipping: {
            type: payload.shipping.type,
            carrier: payload.shipping.carrier
        },
        products: orderProducts
    };
}

function convertOrderToResponse(order: Order): OrderResponse {
    const orderProducts: OrderProductResponse[] = [];
    let totalOrder = 0;

    order?.products?.forEach(product => {
        totalOrder += product.price;
        const { code, price } = product;
        orderProducts.push({ code, price });
    });

    return {
        id: order.sk!,
        email: order.pk,
        createdAt: order.createdAt!,
        products: orderProducts ?? undefined,
        billing: {
            payment: order.billing.payment,
            totalOrder: order.billing.totalOrder
        },
        shipping: {
            type: order.shipping.type,
            carrier: order.shipping.carrier
        }
    }
}

async function produceEvent(order: Order, eventType: OrderEventType, lambdaRequestId: string) {
    const codes: string[] = [];
    order?.products?.forEach((item) => codes.push(item.code));

    const message: OrderEvent = {
        email: order.pk,
        orderId: order.sk!,
        billing: order.billing,
        shipping: order.shipping,
        productCodes: codes,
        requestId: lambdaRequestId
    };

    const envelope: OrderEventSchema = {
        eventType: eventType,
        occurredAt: new Date(),
        data: JSON.stringify(message)
    };

    return SNSClient.publish({
        TopicArn: orderEventsTopicARN,
        Message: JSON.stringify(envelope),
        MessageAttributes: {
            eventType: {
                DataType: 'String',
                StringValue: eventType
            }
        }
    }).promise();
}
