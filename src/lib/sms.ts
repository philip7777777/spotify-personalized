import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

let client: ReturnType<typeof twilio> | null = null;
if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
}

/**
 * Generates a 6-digit numeric verification code.
 */
export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Sends an SMS verification code to the given phone number.
 * Falls back to logging the code to the console when Twilio credentials
 * are not configured, so local development works without a Twilio account.
 */
export async function sendSmsCode(phone: string, code: string): Promise<void> {
  const body = `Your verification code is: ${code}`;

  if (!client || !fromNumber) {
    console.warn(
      `[dev] Twilio not configured. Verification code for ${phone}: ${code}`,
    );
    return;
  }

  await client.messages.create({
    body,
    from: fromNumber,
    to: phone,
  });
}
