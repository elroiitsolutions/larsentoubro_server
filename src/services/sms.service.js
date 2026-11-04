import { env } from '../config/env.js';

/**
 * Normalizes phone number into 10-digit format and +91 E.164 standard.
 *
 * @param {string} rawPhone - Raw input phone number
 * @returns {{ clean10: string, e164: string, isValid: boolean }}
 */
export const normalizeIndianPhoneNumber = (rawPhone) => {
    if (!rawPhone || typeof rawPhone !== 'string') {
        return { clean10: '', e164: '', isValid: false };
    }

    // Strip all non-digit characters
    const digitsOnly = rawPhone.replace(/\D/g, '');

    // Extract last 10 digits if preceded by 91 or 0
    let clean10 = digitsOnly;
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
        clean10 = digitsOnly.slice(2);
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
        clean10 = digitsOnly.slice(1);
    }

    // Indian mobile numbers must be exactly 10 digits starting with 6, 7, 8, or 9
    const isValid = /^[6-9]\d{9}$/.test(clean10);
    const e164 = isValid ? `+91${clean10}` : '';

    return { clean10, e164, isValid };
};

/**
 * Sends a 6-digit OTP code to the guest user's mobile phone via SMS.
 * If no SMS API key is configured or during local development, falls back to the server terminal logger.
 *
 * @param {string} rawPhone - Recipient phone number
 * @param {string} otp - 6-digit numeric OTP code
 * @returns {Promise<{ sent: boolean, devMode: boolean, messageId?: string }>}
 */
export const sendGuestSmsOtp = async (rawPhone, otp) => {
    const { clean10, e164, isValid } = normalizeIndianPhoneNumber(rawPhone);

    if (!isValid) {
        throw new Error('Please provide a valid 10-digit Indian mobile number.');
    }

    const messageText = `${otp} is your single-use verification code to access the L&T Equipment Portal as a Guest. Valid for 5 minutes. Please do not share this code.`;

    // 1. Live SMS Gateway Integration (Fast2SMS / 2Factor / Generic REST)
    if (env.SMS_API_KEY && env.SMS_PROVIDER !== 'mock') {
        try {
            if (env.SMS_PROVIDER === 'fast2sms') {
                // Fast2SMS Quick OTP Route
                const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
                    method: 'POST',
                    headers: {
                        'authorization': env.SMS_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        route: 'otp',
                        variables_values: otp,
                        numbers: clean10
                    })
                });
                const resData = await response.json();
                if (resData.return) {
                    console.log(`[SmsService] Fast2SMS OTP successfully dispatched to ${e164}. Request ID: ${resData.request_id}`);
                    return { sent: true, devMode: false, messageId: resData.request_id };
                }
                console.warn(`[SmsService] Fast2SMS API response:`, resData);
            } else if (env.SMS_PROVIDER === '2factor') {
                // 2Factor.in OTP Route
                const url = `https://2factor.in/v1/API/V1/${env.SMS_API_KEY}/SMS/${clean10}/${otp}/AUTOGEN`;
                const response = await fetch(url);
                const resData = await response.json();
                if (resData.Status === 'Success') {
                    console.log(`[SmsService] 2Factor OTP dispatched to ${e164}. Session ID: ${resData.Details}`);
                    return { sent: true, devMode: false, messageId: resData.Details };
                }
                console.warn(`[SmsService] 2Factor API response:`, resData);
            }
        } catch (error) {
            console.error(`[SmsService] Failed to dispatch live SMS to ${e164}:`, error.message);
            // Fall back to dev logger below
        }
    }

    // 2. Development / Fallback Console Logger
    console.log(`\n=============================================================`);
    console.log(`[L&T GUEST AUTH DEV MODE] SMS OTP GENERATED FOR: ${e164}`);
    console.log(`RECIPIENT PHONE: ${clean10} (${e164})`);
    console.log(`VERIFICATION CODE: [ ${otp} ]`);
    console.log(`SMS BODY: "${messageText}"`);
    console.log(`VALIDITY: 5 MINUTES`);
    console.log(`=============================================================\n`);

    return { sent: true, devMode: true };
};

export default {
    normalizeIndianPhoneNumber,
    sendGuestSmsOtp
};

