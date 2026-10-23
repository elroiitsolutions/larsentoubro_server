/**
 * Simple, efficient utility to parse device, OS, and browser from user-agent string.
 */
export const parseUserAgent = (uaString = '') => {
    if (!uaString) return 'Unknown Device';

    let browser = 'Unknown Browser';
    let os = 'Unknown OS';

    // Detect OS
    if (/Windows NT 10.0/i.test(uaString)) os = 'Windows 10/11';
    else if (/Windows NT 6.3/i.test(uaString)) os = 'Windows 8.1';
    else if (/Windows NT 6.1/i.test(uaString)) os = 'Windows 7';
    else if (/Windows/i.test(uaString)) os = 'Windows';
    else if (/iPhone/i.test(uaString)) os = 'iOS (iPhone)';
    else if (/iPad/i.test(uaString)) os = 'iOS (iPad)';
    else if (/Macintosh|Mac OS X/i.test(uaString)) os = 'macOS';
    else if (/Android/i.test(uaString)) os = 'Android';
    else if (/Linux/i.test(uaString)) os = 'Linux';

    // Detect Browser
    if (/Edg\//i.test(uaString)) browser = 'Microsoft Edge';
    else if (/Chrome\//i.test(uaString) && !/Chromium|OPR/i.test(uaString)) browser = 'Chrome';
    else if (/Firefox\//i.test(uaString)) browser = 'Firefox';
    else if (/Safari\//i.test(uaString) && !/Chrome/i.test(uaString)) browser = 'Safari';
    else if (/OPR|Opera/i.test(uaString)) browser = 'Opera';

    return `${browser} on ${os}`;
};
