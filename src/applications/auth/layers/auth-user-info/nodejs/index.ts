import { APIGatewayEventDefaultAuthorizerContext } from "aws-lambda";
import { CognitoIdentityServiceProvider } from "aws-sdk";

export class AuthInfoService {

    constructor(private cognitoIdentityServiceProvider: CognitoIdentityServiceProvider) {}

    async getUserInfo(authorizer: APIGatewayEventDefaultAuthorizerContext): Promise<string> {
        const userPool = authorizer?.claims.iss.split("amazonaws.com/")[1]
        const userName = authorizer?.claims.username;

        const user = await this.cognitoIdentityServiceProvider.adminGetUser({
            UserPoolId: userPool,
            Username: userName
        }).promise();

        const email = user.UserAttributes?.find(attr => attr.Name === 'email')

        if (!email?.Value) {
            throw new Error("Email not found.");
        }

        return email.Value;
    }
}
