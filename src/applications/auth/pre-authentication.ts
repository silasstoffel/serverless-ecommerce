import { PreAuthenticationTriggerEvent, Context, Callback } from "aws-lambda";

export const handler = async(
    event: PreAuthenticationTriggerEvent,
    context: Context,
    callback: Callback
): Promise<void> => {
    console.log('[pre-authentication] is called')
    console.log('event:', event);
    console.log('context:', context);

    callback(null, event);
}
