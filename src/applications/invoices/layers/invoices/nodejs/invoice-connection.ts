import { ApiGatewayManagementApi } from "aws-sdk";

export class InvoiceWSService {
    constructor(
        private readonly apiGatewayManagementApi: ApiGatewayManagementApi
    ) {}

    async sendData(connectionId:string, data: string): Promise<boolean> {
        try {
            await this.apiGatewayManagementApi.getConnection({
                ConnectionId: connectionId
            }).promise();

            await this.apiGatewayManagementApi.postToConnection({
                ConnectionId: connectionId,
                Data: data
            }).promise();
        } catch {
            return false;
        }
        return true;
    }
}
