import { AWSError, ApiGatewayManagementApi } from "aws-sdk";
import { PromiseResult } from "aws-sdk/lib/request";

export class InvoiceWSService {
    constructor(
        private readonly apiGatewayManagementApi: ApiGatewayManagementApi
    ) {}

    async sendData(connectionId:string, data: string): Promise<boolean> {
        try {
            await this.getConnection(connectionId);
            await this.apiGatewayManagementApi.postToConnection({
                ConnectionId: connectionId,
                Data: data
            }).promise();
        } catch {
            return false;
        }
        return true;
    }

    async sendInvoiceStatus(transactionId:string, connectionId:string, status: string): Promise<void> {
        const data = JSON.stringify({
            transactionId: transactionId,
            status: status
        });

        await this.sendData(connectionId, data);
    }

    async disconnectClient(connectionId:string): Promise<boolean> {
        try {
            await this.getConnection(connectionId);
            await this.apiGatewayManagementApi.deleteConnection({
                ConnectionId: connectionId
            }).promise();
        } catch {
            return false;
        }
        return true;
    }

    private async getConnection(connectionId:string):Promise<PromiseResult<ApiGatewayManagementApi.GetConnectionResponse, AWSError>> {
        return this.apiGatewayManagementApi.getConnection({
            ConnectionId: connectionId
        }).promise();
    }
}
