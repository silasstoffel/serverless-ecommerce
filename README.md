# Serverless E-commerce

This is a project for training AWS CDK.

The `cdk.json` file tells the CDK Toolkit how to execute your app.


# CDK CLI

```shell
npm install -g aws-cdk
```

## Overview

Some components used in the training

![Some components used in the training](/docs/overview-apps.png "Some components used in the training").

Authenticate diagram
![Authenticate diagram](/docs/auth-schema.png "Authenticate diagram").

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

# API

[Insomnia Collection](./docs/insomnia-collection.json)
