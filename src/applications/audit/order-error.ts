import { EventBridgeEvent, Context } from "aws-lambda";

export async function handler(event: EventBridgeEvent<string, string>, Context: Context): Promise<void> {
    console.log(event);
}
