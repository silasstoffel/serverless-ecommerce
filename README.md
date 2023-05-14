# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.


# CDK CLI

```shell
npm install -g aws-cdk
```

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
* `cdk bootstrap`   runs this for create bucket in your aws account (IMPORTANT: Run this command only one time)
* `cdk deploy --all --require-approval never`  deploy all stack and dot not require approval



# WebSocket Requests

Get url to upload

```json
{ "action": "get-import-url" }
```

Cancel import

```json
{
	"action": "cancel-import",
	"transactionId": "07ab900d-1f33-4918-af79-b191820f80d6"
}
```
