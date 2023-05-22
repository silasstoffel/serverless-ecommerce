import { Context, Callback, PostConfirmationTriggerEvent } from "aws-lambda";

export const handler = async(
    event: PostConfirmationTriggerEvent,
    context: Context,
    callback: Callback
): Promise<void> => {
    console.log('[post-confirmation] is called')
    console.log('event:', event);
    console.log('context:', context);

    callback(null, event);
}
