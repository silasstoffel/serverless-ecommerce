import { PaymentType, OrderShipping } from '/opt/nodejs/orders-layer';

export interface OrderProductResponse {
    code: string;
    price: number;
}

export interface OrderRequest {
    email: string,
    productIds: string[],
    payment: PaymentType,
    shipping: OrderShipping
}

export interface OrderResponse {
    id: string,
    email: string,
    createdAt: number,
    shipping: OrderShipping,
    billing: {
        payment: PaymentType,
        totalOrder: number
    },
    products: OrderProductResponse[]
}
